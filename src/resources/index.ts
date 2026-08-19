import type { McpServer } from '@modelcontextprotocol/server';
import { PACKAGING_HINTS, PACKAGING_HINTS_URI } from './packaging-hints.js';
import { PLUGIN_JSON_SCHEMA, PLUGIN_JSON_SCHEMA_URI } from './plugin-json-schema.js';

export function registerResources(server: McpServer): void {
  server.registerResource(
    'plugin-json-schema',
    PLUGIN_JSON_SCHEMA_URI,
    {
      title: 'plugin.json schema',
      description: 'Minimal valid plugin.json plus forbidden fields',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(PLUGIN_JSON_SCHEMA, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'packaging-hints',
    PACKAGING_HINTS_URI,
    {
      title: 'Packaging hints',
      description:
        'nupkg root layout, PackageId vs plugin.json.id, NuGet SemVer, forbidden publish fields, icon dual path',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(PACKAGING_HINTS, null, 2),
        },
      ],
    }),
  );
}
