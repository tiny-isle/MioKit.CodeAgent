import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { jsonToolResult } from '../lib/mcp-result.js';
import { validatePluginJsonText } from '../lib/plugin-json.js';
import { readFile } from 'node:fs/promises';

export function registerValidatePluginJson(server: McpServer): void {
  server.registerTool(
    'validate_plugin_json',
    {
      description:
        'Validate a plugin.json file: required fields, forbidden pluginVersion/releaseState/releaseDate, and System.Version ranges. Call after editing plugin.json, and before pack or inspect.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Filesystem path to plugin.json'),
      }),
    },
    async ({ path: filePath }) => {
      try {
        const text = await readFile(filePath, 'utf8');
        const report = validatePluginJsonText(text);
        return jsonToolResult(
          { ok: report.errors.length === 0, path: filePath, ...report },
          report.errors.length > 0,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonToolResult(
          {
            ok: false,
            path: filePath,
            errors: [`Failed to read plugin.json: ${message}`],
            warnings: [],
            hints: ['Pass the path to plugin/plugin.json under the plugin solution.'],
          },
          true,
        );
      }
    },
  );
}
