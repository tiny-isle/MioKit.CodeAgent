import type { McpServer } from '@modelcontextprotocol/server';
import { registerGenerateGuid } from './generate-guid.js';

/** Register every MCP tool on the server. Add new tools here. */
export function registerTools(server: McpServer): void {
  registerGenerateGuid(server);
}
