import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createPlugin } from './create-plugin.js';
import { packPlugin } from './pack-plugin.js';
import { resolvePluginLayout } from './plugin-layout.js';
import type { DotnetRunResult } from './dotnet.js';
import type { InspectNupkgResult } from './nupkg-inspect.js';

function okDotnet(stdout = ''): DotnetRunResult {
  return {
    command: 'dotnet',
    args: [],
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
  };
}

describe('create-plugin', () => {
  it('refuses to overwrite an existing plugin.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'miokit-create-'));
    await mkdir(path.join(root, 'plugin'), { recursive: true });
    await writeFile(path.join(root, 'plugin', 'plugin.json'), '{}');

    const result = await createPlugin(
      { template: 'miokit-plugin', name: 'Demo', output: root },
      {
        runDotnet: async () => okDotnet(),
        ensure: {
          runDotnet: async () => okDotnet(),
          fetchLatestVersion: async () => '1.0.0',
        },
      },
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0]!, /Refusing to overwrite/);
  });

  it('suggests pluginId from org and runs dotnet new', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'miokit-create-'));
    let captured: string[] = [];
    const result = await createPlugin(
      { template: 'miokit-plugin', name: 'My Plugin', output: root, org: 'contoso' },
      {
        runDotnet: async (args) => {
          captured = args;
          await mkdir(path.join(root, 'plugin'), { recursive: true });
          await writeFile(
            path.join(root, 'plugin', 'plugin.json'),
            JSON.stringify({ id: 'com.contoso.plugin.my-plugin' }),
          );
          return okDotnet();
        },
        ensure: {
          runDotnet: async (args) => {
            if (args[1] === 'list') {
              return okDotnet('miokit-plugin');
            }
            return okDotnet(`
Currently installed items:
  MioKit.Plugin.Templates
    Version: 1.0.0
    Templates:
      MioKit Plugin (miokit-plugin) C#
`);
          },
          fetchLatestVersion: async () => '1.0.0',
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.pluginId, 'com.contoso.plugin.my-plugin');
    assert.ok(captured.includes('--pluginId'));
    assert.ok(captured.includes('com.contoso.plugin.my-plugin'));
  });
});

describe('pack-plugin', () => {
  it('packs with PackageId defaulting to the csproj name and inspects by default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'miokit-pack-'));
    await mkdir(path.join(root, 'plugin'), { recursive: true });
    await writeFile(path.join(root, 'plugin', 'plugin.json'), JSON.stringify({ id: 'com.contoso.plugin.demo' }));
    await writeFile(path.join(root, 'plugin', 'Demo.csproj'), '<Project />');
    await mkdir(path.join(root, 'artifacts'), { recursive: true });
    await writeFile(path.join(root, 'artifacts', 'Demo.1.2.0.nupkg'), 'nupkg');

    const inspect: InspectNupkgResult = {
      ok: true,
      files: ['plugin.json'],
      errors: [],
      warnings: [],
      hints: [],
    };
    const result = await packPlugin(
      { solutionRoot: root, packageVersion: '1.2.0' },
      {
        runDotnet: async (args) => {
          assert.ok(args.includes('pack'));
          assert.ok(args.some((item) => item.startsWith('-p:PackageId=Demo')));
          assert.ok(args.some((item) => item.startsWith('-p:PackageVersion=1.2.0')));
          return okDotnet();
        },
        inspectNupkg: async () => inspect,
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.packageId, 'Demo');
    assert.ok(result.nupkgPath?.endsWith('Demo.1.2.0.nupkg'));
  });
});

describe('plugin-layout', () => {
  it('resolves plugin.json and csproj', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'miokit-layout-'));
    await mkdir(path.join(root, 'plugin'), { recursive: true });
    await writeFile(path.join(root, 'plugin', 'plugin.json'), '{}');
    await writeFile(path.join(root, 'plugin', 'Foo.csproj'), '<Project />');
    const layout = await resolvePluginLayout(root);
    assert.equal(layout.projectName, 'Foo');
    assert.equal(layout.hasVueUi, false);
  });
});
