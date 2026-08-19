import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkDevEnvironment,
  parseDotnetSdkList,
  parseRegSzValue,
  pickDotnetSdkMajor,
  pluginKindFromLayout,
  pluginKindFromTemplate,
} from './dev-environment.js';
import type { DotnetRunResult } from './dotnet.js';

function fakeDotnet(stdout: string, exitCode: number | null = 0): DotnetRunResult {
  return {
    command: 'dotnet',
    args: ['--list-sdks'],
    stdout,
    stderr: '',
    exitCode,
    timedOut: false,
  };
}

describe('dev-environment parsers', () => {
  it('parses dotnet --list-sdks lines', () => {
    const versions = parseDotnetSdkList(`
8.0.400 [C:\\Program Files\\dotnet\\sdk]
9.0.304 [C:\\Program Files\\dotnet\\sdk]
10.0.100 [C:\\Program Files\\dotnet\\sdk]
10.0.101-preview.1 [C:\\Program Files\\dotnet\\sdk]
`);
    assert.deepEqual(versions, ['8.0.400', '9.0.304', '10.0.100', '10.0.101-preview.1']);
    assert.equal(pickDotnetSdkMajor(versions, 10), '10.0.101-preview.1');
    assert.equal(pickDotnetSdkMajor(['8.0.400', '9.0.304'], 10), undefined);
  });

  it('parses reg query REG_SZ values', () => {
    const stdout = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}
    pv    REG_SZ    128.0.2739.42
`;
    assert.equal(parseRegSzValue(stdout, 'pv'), '128.0.2739.42');
  });

  it('maps template and vue-ui layout to plugin kind', () => {
    assert.equal(pluginKindFromTemplate('miokit-plugin'), 'standard');
    assert.equal(pluginKindFromTemplate('miokit-plugin-webview2'), 'webview2');
    assert.equal(pluginKindFromLayout(false), 'standard');
    assert.equal(pluginKindFromLayout(true), 'webview2');
  });
});

describe('checkDevEnvironment', () => {
  it('fails when no .NET 10 SDK is present', async () => {
    const result = await checkDevEnvironment(
      { kind: 'standard' },
      {
        runDotnet: async () => fakeDotnet('8.0.400 [C:\\sdk]\n9.0.304 [C:\\sdk]\n'),
        platform: 'win32',
      },
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0]!, /10 SDK is required/);
    assert.ok(result.hints.some((hint) => hint.includes('dotnet.microsoft.com')));
  });

  it('passes a standard plugin when .NET 10 SDK is installed', async () => {
    const result = await checkDevEnvironment(
      { kind: 'standard' },
      {
        runDotnet: async () => fakeDotnet('10.0.100 [C:\\sdk]\n'),
        platform: 'win32',
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.dotnetSdk.selected, '10.0.100');
    assert.equal(result.webView2, undefined);
  });

  it('requires WebView2 Runtime for webview2 plugins', async () => {
    const result = await checkDevEnvironment(
      { kind: 'webview2' },
      {
        runDotnet: async () => fakeDotnet('10.0.100 [C:\\sdk]\n'),
        queryWebView2: async () => undefined,
        runPnpmVersion: async () => '10.0.0',
        platform: 'win32',
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.webView2?.ok, false);
    assert.match(result.errors[0]!, /WebView2 Runtime/);
  });

  it('passes webview2 when SDK and Runtime are present; pnpm missing is a warning', async () => {
    const result = await checkDevEnvironment(
      { kind: 'webview2' },
      {
        runDotnet: async () => fakeDotnet('10.0.100 [C:\\sdk]\n'),
        queryWebView2: async () => ({ version: '128.0.2739.42', source: 'registry' }),
        runPnpmVersion: async () => undefined,
        platform: 'win32',
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.webView2?.ok, true);
    assert.equal(result.pnpm?.ok, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0]!, /pnpm/);
  });

  it('fails webview2 on non-Windows even with a .NET 10 SDK', async () => {
    const result = await checkDevEnvironment(
      { kind: 'webview2' },
      {
        runDotnet: async () => fakeDotnet('10.0.100 [/usr/share/dotnet/sdk]\n'),
        queryWebView2: async () => ({ version: '1.0', source: 'fake' }),
        runPnpmVersion: async () => '10.0.0',
        platform: 'linux',
      },
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0]!, /require Windows/);
  });
});
