import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareNuGetVersions, getNugetSourceOverride, nugetSourceArgs } from './nuget-source.js';
import { ensurePluginTemplates, parseInstalledTemplateSources } from './templates.js';
import type { DotnetRunResult } from './dotnet.js';

function fakeDotnet(stdout: string, exitCode = 0): DotnetRunResult {
  return {
    command: 'dotnet',
    args: [],
    stdout,
    stderr: '',
    exitCode,
    timedOut: false,
  };
}

const nugetUninstall = `
Currently installed items:
  MioKit.Plugin.Templates
    Details:
      NuGetPackageId: MioKit.Plugin.Templates
      Version: 1.0.0
      Author: MioKit
    Templates:
      MioKit Plugin (miokit-plugin) C#
    Uninstall Command:
      dotnet new uninstall MioKit.Plugin.Templates
`;

const listOutput = `
Template Name                    Short Name                 Language  Tags
MioKit Plugin                    miokit-plugin              [C#]      MioKit
`;

describe('nuget-source', () => {
  it('omits --nuget-source unless miokit-nuget-url is set', () => {
    assert.equal(getNugetSourceOverride({}), undefined);
    assert.deepEqual(nugetSourceArgs({}), []);
    assert.deepEqual(nugetSourceArgs({ 'miokit-nuget-url': ' https://feed.example/v3/index.json ' }), [
      '--nuget-source',
      'https://feed.example/v3/index.json',
    ]);
  });

  it('compares NuGet versions with prerelease lower than release', () => {
    assert.ok(compareNuGetVersions('1.2.0', '1.1.9') > 0);
    assert.ok(compareNuGetVersions('1.0.0', '1.0.0-beta.1') > 0);
    assert.equal(compareNuGetVersions('1.0.0', '1.0.0'), 0);
  });
});

describe('templates', () => {
  it('parses nuget and folder installs from uninstall output', () => {
    const nuget = parseInstalledTemplateSources(nugetUninstall);
    assert.equal(nuget[0]?.name, 'MioKit.Plugin.Templates');
    assert.equal(nuget[0]?.version, '1.0.0');
    assert.equal(nuget[0]?.isFolder, false);

    const folder = parseInstalledTemplateSources(`
Currently installed items:
  D:\\Documents\\template\\MioKit.Plugin.Templates
    Templates:
      MioKit Plugin (miokit-plugin) C#
    Uninstall Command:
      dotnet new uninstall D:\\Documents\\template\\MioKit.Plugin.Templates
`);
    assert.equal(folder[0]?.isFolder, true);
  });

  it('fails when templates come from a folder path', async () => {
    const result = await ensurePluginTemplates({
      runDotnet: async (args) => {
        if (args[1] === 'list') {
          return fakeDotnet(listOutput);
        }
        return fakeDotnet(`
Currently installed items:
  D:\\Documents\\template\\MioKit.Plugin.Templates
    Templates:
      MioKit Plugin (miokit-plugin) C#
`);
      },
      fetchLatestVersion: async () => '1.0.0',
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'folder');
    assert.ok(result.hints[0]?.includes('dotnet new uninstall'));
  });

  it('installs when nothing is present', async () => {
    const commands: string[][] = [];
    const result = await ensurePluginTemplates({
      runDotnet: async (args) => {
        commands.push(args);
        if (args[1] === 'install') {
          return fakeDotnet('installed');
        }
        if (args[1] === 'list') {
          return fakeDotnet('No templates found matching: miokit.');
        }
        return fakeDotnet(commands.some((item) => item[1] === 'install') ? nugetUninstall : 'Currently installed items:');
      },
      fetchLatestVersion: async () => '1.0.0',
    });
    assert.equal(result.ok, true);
    assert.equal(result.updated, true);
    assert.ok(commands.some((item) => item[0] === 'new' && item[1] === 'install'));
  });

  it('updates when the source has a newer version', async () => {
    const commands: string[][] = [];
    const result = await ensurePluginTemplates({
      runDotnet: async (args) => {
        commands.push(args);
        if (args[1] === 'list') {
          return fakeDotnet(listOutput);
        }
        if (args[1] === 'install') {
          return fakeDotnet('updated');
        }
        return fakeDotnet(nugetUninstall);
      },
      fetchLatestVersion: async () => '1.2.0',
    });
    assert.equal(result.ok, true);
    assert.equal(result.updated, true);
    assert.ok(commands.some((item) => item.includes('MioKit.Plugin.Templates::1.2.0')));
  });
});
