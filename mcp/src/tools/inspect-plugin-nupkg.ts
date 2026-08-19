import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { jsonToolResult } from '../lib/mcp-result.js';
import { inspectPluginNupkgFile } from '../lib/nupkg-inspect.js';

export function registerInspectPluginNupkg(server: McpServer): void {
  server.registerTool(
    'inspect_plugin_nupkg',
    {
      description:
        'Unzip a .nupkg in memory and check MioKit plugin layout: root plugin.json + assembly DLL, forbidden host DLLs, icon paths, nugetDependents dual-source, uninstall artifacts, and the miokit.plugin-package description envelope. Call after pack_plugin or when reviewing an existing nupkg.',
      inputSchema: z.object({
        nupkgPath: z.string().min(1).describe('Filesystem path to a .nupkg file'),
        expectWebView2: z
          .boolean()
          .optional()
          .describe('Treat the package as WebView2 and require ui/dist even if not obvious from zip contents'),
      }),
    },
    async ({ nupkgPath, expectWebView2 }) => {
      try {
        const result = await inspectPluginNupkgFile(nupkgPath, { expectWebView2 });
        return jsonToolResult(result, !result.ok);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonToolResult(
          {
            ok: false,
            errors: [`Failed to inspect nupkg: ${message}`],
            warnings: [],
            hints: ['Pass a path to a .nupkg produced by pack_plugin / dotnet pack.'],
            files: [],
          },
          true,
        );
      }
    },
  );
}
