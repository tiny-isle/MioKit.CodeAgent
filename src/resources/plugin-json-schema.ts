export const PLUGIN_JSON_SCHEMA_URI = 'miokit://plugin-json-schema';

export const PLUGIN_JSON_SCHEMA = {
  required: [
    'metadataVersion',
    'id',
    'name',
    'assembly',
    'minSdkVersion',
  ],
  forbidden: ['pluginVersion', 'releaseState', 'releaseDate'],
  versionFormat:
    'System.Version (major.minor[.build[.revision]]); no SemVer suffix such as -beta',
  idFormat: 'com.<org>.plugin.<slug>',
  example: {
    metadataVersion: '1.0',
    id: 'com.contoso.plugin.my-plugin',
    name: 'My Plugin',
    assembly: 'MyPlugin.dll',
    minSdkVersion: '2.0.0',
  },
} as const;
