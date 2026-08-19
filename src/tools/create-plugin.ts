import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createPlugin } from '../lib/create-plugin.js';
import { jsonToolResult } from '../lib/mcp-result.js';

export function registerCreatePlugin(server: McpServer): void {
  server.registerTool(
    'create_plugin',
    {
      description:
        'Create a MioKit plugin solution with dotnet new. Call when the workspace has no plugin/plugin.json and the user wants a new plugin. Runs check_dev_environment then ensure_plugin_templates first. Do not hand-write the solution skeleton or invoke dotnet new yourself.',
      inputSchema: z.object({
        template: z
          .enum(['miokit-plugin', 'miokit-plugin-webview2'])
          .describe('miokit-plugin (standard) or miokit-plugin-webview2 (WebView2 + Vue)'),
        name: z.string().min(1).describe('Solution name passed to dotnet new --name / -n'),
        output: z.string().min(1).describe('Output directory passed to dotnet new --output / -o'),
        pluginId: z
          .string()
          .min(1)
          .optional()
          .describe('Global plugin id; omit to use org+name or the template default'),
        displayName: z.string().min(1).optional().describe('plugin.json name'),
        description: z.string().min(1).optional().describe('plugin.json description'),
        pluginAuthor: z.string().min(1).optional().describe('plugin.json author'),
        org: z
          .string()
          .min(1)
          .optional()
          .describe('Used with name to suggest pluginId when pluginId is omitted'),
      }),
    },
    async (input) => {
      const result = await createPlugin(input);
      return jsonToolResult(result, !result.ok);
    },
  );
}
