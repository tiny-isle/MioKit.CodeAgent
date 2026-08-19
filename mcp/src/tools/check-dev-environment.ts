import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { checkDevEnvironment } from '../lib/dev-environment.js';
import { jsonToolResult } from '../lib/mcp-result.js';

export function registerCheckDevEnvironment(server: McpServer): void {
  server.registerTool(
    'check_dev_environment',
    {
      description:
        'Check the local MioKit plugin development environment. Call first, before ensure_plugin_templates / create_plugin / pack_plugin. Standard plugins need the .NET 10 SDK. WebView2 plugins also need the Microsoft Edge WebView2 Runtime. Missing pnpm is a warning only.',
      inputSchema: z.object({
        kind: z
          .enum(['standard', 'webview2'])
          .default('standard')
          .describe('standard = .NET 10 SDK; webview2 = .NET 10 SDK + WebView2 Runtime'),
      }),
    },
    async ({ kind }) => {
      const result = await checkDevEnvironment({ kind });
      return jsonToolResult(result, !result.ok);
    },
  );
}
