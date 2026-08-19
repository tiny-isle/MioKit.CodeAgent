import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLUGIN_ID_PATTERN, suggestPluginId, slugify, normalizeOrg } from './plugin-id.js';

describe('plugin-id', () => {
  it('builds com.<org>.plugin.<slug> from org + name', () => {
    const result = suggestPluginId({ org: 'Contoso', name: 'My Plugin' });
    assert.equal(result.pluginId, 'com.contoso.plugin.my-plugin');
    assert.equal(result.org, 'contoso');
    assert.equal(result.slug, 'my-plugin');
    assert.match(result.pluginId, PLUGIN_ID_PATTERN);
  });

  it('strips a leading com. from org so ids are not com.com.x', () => {
    const result = suggestPluginId({ org: 'com.contoso', name: 'Clipboard' });
    assert.equal(result.pluginId, 'com.contoso.plugin.clipboard');
  });

  it('prefers slug over name', () => {
    const result = suggestPluginId({ org: 'acme', name: 'Ignored', slug: 'clip-board' });
    assert.equal(result.pluginId, 'com.acme.plugin.clip-board');
  });

  it('slugify collapses punctuation', () => {
    assert.equal(slugify('  MioKit.Clipboard!! '), 'miokit-clipboard');
    assert.equal(normalizeOrg('COM.Foo_Bar'), 'foo-bar');
  });

  it('rejects empty slugs', () => {
    assert.throws(() => suggestPluginId({ org: '!!!', name: 'x' }), /empty slug/);
    assert.throws(() => suggestPluginId({ org: 'acme', name: '---' }), /empty slug/);
  });
});
