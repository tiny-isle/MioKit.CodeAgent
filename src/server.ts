import { McpServer } from '@modelcontextprotocol/server';
import { registerTools } from './tools/index.js';

export const SERVER_NAME = 'miokit-mcp';
export const SERVER_VERSION = '0.1.0';

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);
  return server;
}
