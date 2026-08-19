import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { jsonToolResult } from '../lib/mcp-result.js';
import { suggestPluginId } from '../lib/plugin-id.js';

export function registerSuggestPluginId(server: McpServer): void {
  server.registerTool(
    'suggest_plugin_id',
    {
      description:
        'Suggest a stable plugin id in the form com.<org>.plugin.<slug>. Call before create_plugin when pluginId is not decided yet. create_plugin can reuse this internally when org is passed.',
      inputSchema: z.object({
        org: z.string().min(1).describe('Organization segment, e.g. contoso or com.contoso'),
        name: z
          .string()
          .min(1)
          .optional()
          .describe('Plugin display or solution name; slugified when slug is omitted'),
        slug: z
          .string()
          .min(1)
          .optional()
          .describe('Optional pre-slugified short name; takes precedence over name'),
      }),
    },
    async ({ org, name, slug }) => {
      try {
        const result = suggestPluginId({ org, name, slug });
        return jsonToolResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonToolResult({ errors: [message] }, true);
      }
    },
  );
}
