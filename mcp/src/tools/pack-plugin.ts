import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { jsonToolResult } from '../lib/mcp-result.js';
import { packPlugin } from '../lib/pack-plugin.js';

export function registerPackPlugin(server: McpServer): void {
  server.registerTool(
    'pack_plugin',
    {
      description:
        'Pack a MioKit plugin with dotnet pack into <solution>/artifacts. Runs check_dev_environment first (.NET 10 SDK; WebView2 Runtime when plugin/vue-ui exists). PackageVersion is required. By default inspect_plugin_nupkg runs afterwards; packing is not complete unless that check has no errors. Does not nuget push.',
      inputSchema: z.object({
        solutionRoot: z
          .string()
          .min(1)
          .describe('Plugin solution root (directory that contains plugin/)'),
        packageVersion: z
          .string()
          .min(1)
          .describe('NuGet PackageVersion, e.g. 1.2.0 or 1.3.0-beta.1'),
        packageId: z
          .string()
          .min(1)
          .optional()
          .describe('NuGet PackageId; defaults to the plugin csproj project name'),
        inspect: z
          .boolean()
          .default(true)
          .describe('Run inspect_plugin_nupkg after packing (default true)'),
      }),
    },
    async (input) => {
      const result = await packPlugin(input);
      return jsonToolResult(result, !result.ok);
    },
  );
}
