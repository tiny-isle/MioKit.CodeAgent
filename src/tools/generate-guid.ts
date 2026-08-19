import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { generateGuid } from '../lib/guid.js';

export function registerGenerateGuid(server: McpServer): void {
  server.registerTool(
    'generate_guid',
    {
      description:
        'Generate one or more RFC 4122 UUID v4 GUIDs. Use for unique IDs, keys, or filenames.',
      inputSchema: z.object({
        count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(1)
          .describe('Number of GUIDs to generate (1–100)'),
        uppercase: z
          .boolean()
          .default(true)
          .describe('Return uppercase hex characters (default true)'),
        hyphens: z
          .boolean()
          .default(true)
          .describe('Keep standard 8-4-4-4-12 hyphens'),
      }),
    },
    async ({ count, uppercase, hyphens }) => {
      const ids = generateGuid({ count, uppercase, hyphens });
      return {
        content: [{ type: 'text', text: ids.join('\n') }],
      };
    },
  );
}
