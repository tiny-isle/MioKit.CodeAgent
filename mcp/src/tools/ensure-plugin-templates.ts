import type { McpServer } from '@modelcontextprotocol/server';
import { jsonToolResult } from '../lib/mcp-result.js';
import { ensurePluginTemplates } from '../lib/templates.js';

export function registerEnsurePluginTemplates(server: McpServer): void {
  server.registerTool(
    'ensure_plugin_templates',
    {
      description:
        'Check, install, or update MioKit.Plugin.Templates from NuGet. Runs check_dev_environment (.NET 10 SDK) first. Call before create_plugin, or when the user asks whether the template pack is installed / needs updating. Fails if templates were installed from a local folder.',
    },
    async () => {
      const result = await ensurePluginTemplates();
      return jsonToolResult(result, !result.ok);
    },
  );
}
