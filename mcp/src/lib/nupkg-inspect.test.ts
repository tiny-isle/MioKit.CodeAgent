import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { inspectPluginNupkg } from './nupkg-inspect.js';

const pluginJson = {
  metadataVersion: '1.0',
  id: 'com.contoso.plugin.my-plugin',
  name: 'My Plugin',
  assembly: 'MyPlugin.dll',
  minSdkVersion: '1.0.0',
  icon: 'Assets/icon.png',
};

const envelope = {
  schema: 'miokit.plugin-package',
  schemaVersion: 1,
  plugin: pluginJson,
};

function nuspec(options: { icon?: string; description?: string } = {}): string {
  const icon = options.icon ?? 'Assets/icon.png';
  const description = options.description ?? JSON.stringify(envelope);
  return `<?xml version="1.0"?>
<package>
  <metadata>
    <id>Contoso.MioKit.MyPlugin</id>
    <version>1.2.0</version>
    <description>${escapeXml(description)}</description>
    <icon>${icon}</icon>
  </metadata>
</package>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function pack(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    encoded[name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(encoded);
}

function validFiles(overrides: Record<string, string | Uint8Array> = {}): Record<string, string | Uint8Array> {
  return {
    'plugin.json': JSON.stringify(pluginJson),
    'MyPlugin.dll': new Uint8Array([1, 2, 3]),
    'Assets/icon.png': new Uint8Array([4, 5, 6]),
    'Contoso.MioKit.MyPlugin.nuspec': nuspec(),
    ...overrides,
  };
}

describe('nupkg-inspect', () => {
  it('accepts a well-formed plugin nupkg', () => {
    const report = inspectPluginNupkg(pack(validFiles()));
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  });

  it('errors when the assembly DLL is missing', () => {
    const files = validFiles();
    delete files['MyPlugin.dll'];
    const report = inspectPluginNupkg(pack(files));
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('MyPlugin.dll')));
  });

  it('errors when a host shared DLL is packed', () => {
    const report = inspectPluginNupkg(
      pack(validFiles({ 'MioKit.Sdk.dll': new Uint8Array([9]) })),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('MioKit.Sdk.dll')));
  });

  it('errors on forbidden publish fields in plugin.json', () => {
    const report = inspectPluginNupkg(
      pack(
        validFiles({
          'plugin.json': JSON.stringify({ ...pluginJson, pluginVersion: '1.0.0' }),
        }),
      ),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('pluginVersion')));
  });

  it('errors when nuspec description is not the JSON envelope', () => {
    const report = inspectPluginNupkg(
      pack(
        validFiles({
          'Contoso.MioKit.MyPlugin.nuspec': nuspec({ description: '<p>old html</p>' }),
        }),
      ),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('miokit.plugin-package')));
  });

  it('errors when nuspec icon does not match plugin.json.icon', () => {
    const report = inspectPluginNupkg(
      pack(
        validFiles({
          'Contoso.MioKit.MyPlugin.nuspec': nuspec({ icon: 'icon.png' }),
        }),
      ),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('does not match')));
    assert.ok(report.hints.some((item) => item.includes('PackageIcon')));
  });

  it('errors when a private DLL is packed without nugetDependents', () => {
    const report = inspectPluginNupkg(
      pack(validFiles({ 'Contoso.MyPrivateLibrary.dll': new Uint8Array([7]) })),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('nugetDependents')));
  });

  it('errors on nugetDependents dual source', () => {
    const report = inspectPluginNupkg(
      pack(
        validFiles({
          'plugin.json': JSON.stringify({
            ...pluginJson,
            nugetDependents: [{ id: 'Contoso.MyPrivateLibrary', version: '2.1.0' }],
          }),
          'Contoso.MyPrivateLibrary.dll': new Uint8Array([7]),
        }),
      ),
    );
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('dual source')));
  });

  it('errors when WebView2 dist is missing', () => {
    const report = inspectPluginNupkg(pack(validFiles()), { expectWebView2: true });
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((item) => item.includes('ui/dist')));
  });
});
