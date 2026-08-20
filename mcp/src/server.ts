import { McpServer } from '@modelcontextprotocol/server';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';

export const SERVER_NAME = 'miokit-mcp';
export const SERVER_VERSION = '0.0.2';

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);
  registerResources(server);
  return server;
}
