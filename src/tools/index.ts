import type { McpServer } from '@modelcontextprotocol/server';
import { registerCreatePlugin } from './create-plugin.js';
import { registerEnsurePluginTemplates } from './ensure-plugin-templates.js';
import { registerGenerateGuid } from './generate-guid.js';
import { registerInspectPluginNupkg } from './inspect-plugin-nupkg.js';
import { registerPackPlugin } from './pack-plugin.js';
import { registerSuggestPluginId } from './suggest-plugin-id.js';
import { registerValidatePluginJson } from './validate-plugin-json.js';

/** Register every MCP tool on the server. Add new tools here. */
export function registerTools(server: McpServer): void {
  registerEnsurePluginTemplates(server);
  registerSuggestPluginId(server);
  registerCreatePlugin(server);
  registerGenerateGuid(server);
  registerValidatePluginJson(server);
  registerPackPlugin(server);
  registerInspectPluginNupkg(server);
}
