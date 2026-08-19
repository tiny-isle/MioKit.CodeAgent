import type { CallToolResult } from '@modelcontextprotocol/server';

export function jsonToolResult(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError,
  };
}
