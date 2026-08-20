import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSystemVersion, validatePluginJson, validatePluginJsonText } from './plugin-json.js';

const valid = {
  metadataVersion: '1.0',
  id: 'com.contoso.plugin.my-plugin',
  name: 'My Plugin',
  assembly: 'MyPlugin.dll',
  minSdkVersion: '1.0.0',
};

describe('plugin-json', () => {
  it('accepts a minimal valid manifest', () => {
    const report = validatePluginJson(valid);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
  });

  it('requires the five runtime fields', () => {
    const report = validatePluginJson({});
    assert.equal(report.errors.length, 5);
    for (const field of ['metadataVersion', 'id', 'name', 'assembly', 'minSdkVersion']) {
      assert.ok(report.errors.some((item) => item.includes(`"${field}"`)));
    }
  });

  it('rejects forbidden publish fields', () => {
    const report = validatePluginJson({
      ...valid,
      pluginVersion: '1.0.0',
      releaseState: 'stable',
      releaseDate: '2026-01-01',
    });
    assert.equal(report.errors.length, 3);
  });

  it('rejects SemVer suffixes on System.Version fields', () => {
    assert.equal(isSystemVersion('2.0.0'), true);
    assert.equal(isSystemVersion('1.0'), true);
    assert.equal(isSystemVersion('1.0.0.0'), true);
    assert.equal(isSystemVersion('1.0.0-beta'), false);
    const report = validatePluginJson({ ...valid, maxSdkVersion: '3.0.0-rc.1' });
    assert.ok(report.errors.some((item) => item.includes('maxSdkVersion')));
  });

  it('warns on id that is not com.org.plugin.slug', () => {
    const report = validatePluginJson({ ...valid, id: 'MyPlugin' });
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings[0]?.includes('com.<org>.plugin.<slug>'));
    assert.ok(report.hints.length > 0);
  });

  it('reports invalid JSON', () => {
    const report = validatePluginJsonText('{');
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0]!, /not valid JSON/);
  });
});
