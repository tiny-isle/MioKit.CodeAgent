import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CREATE_PLUGIN_TIMEOUT_MS,
  formatDotnetFailure,
  runDotnet,
  type DotnetRunner,
} from './dotnet.js';
import { parsePluginJsonText } from './plugin-json.js';
import { suggestPluginId } from './plugin-id.js';
import {
  defaultEnsureTemplatesDeps,
  ensurePluginTemplates,
  type EnsureTemplatesDeps,
  type EnsureTemplatesResult,
} from './templates.js';

export const PLUGIN_TEMPLATES = ['miokit-plugin', 'miokit-plugin-webview2'] as const;
export type PluginTemplate = (typeof PLUGIN_TEMPLATES)[number];

export interface CreatePluginInput {
  template: PluginTemplate;
  name: string;
  output: string;
  pluginId?: string;
  displayName?: string;
  description?: string;
  pluginAuthor?: string;
  org?: string;
}

export interface CreatePluginResult {
  ok: boolean;
  outputPath?: string;
  template?: PluginTemplate;
  pluginId?: string;
  pluginJsonPath?: string;
  ensure?: EnsureTemplatesResult;
  errors: string[];
  hints: string[];
}

export interface CreatePluginDeps {
  runDotnet: DotnetRunner;
  ensure?: EnsureTemplatesDeps;
}

export function defaultCreatePluginDeps(): CreatePluginDeps {
  return { runDotnet, ensure: defaultEnsureTemplatesDeps() };
}

export async function createPlugin(
  input: CreatePluginInput,
  deps: CreatePluginDeps = defaultCreatePluginDeps(),
): Promise<CreatePluginResult> {
  const outputPath = path.resolve(input.output);
  const pluginJsonPath = path.join(outputPath, 'plugin', 'plugin.json');

  if (await fileExists(pluginJsonPath)) {
    return {
      ok: false,
      outputPath,
      template: input.template,
      pluginJsonPath,
      errors: [`Refusing to overwrite existing plugin at ${pluginJsonPath}`],
      hints: ['Pick a different output directory, or continue with the existing plugin project.'],
    };
  }

  const ensure = await ensurePluginTemplates(deps.ensure ?? defaultEnsureTemplatesDeps());
  if (!ensure.ok) {
    return {
      ok: false,
      outputPath,
      template: input.template,
      ensure,
      errors: ensure.errors,
      hints: ensure.hints,
    };
  }

  let pluginId = input.pluginId?.trim() || undefined;
  if (!pluginId && input.org) {
    try {
      pluginId = suggestPluginId({ org: input.org, name: input.name }).pluginId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        outputPath,
        template: input.template,
        ensure,
        errors: [message],
        hints: ['Pass pluginId explicitly, or provide an org and name that slugify to letters/digits.'],
      };
    }
  }

  const args = ['new', input.template, '--name', input.name, '--output', outputPath];
  if (pluginId) {
    args.push('--pluginId', pluginId);
  }
  if (input.displayName) {
    args.push('--displayName', input.displayName);
  }
  if (input.description) {
    args.push('--description', input.description);
  }
  if (input.pluginAuthor) {
    args.push('--pluginAuthor', input.pluginAuthor);
  }

  const result = await deps.runDotnet(args, { timeoutMs: CREATE_PLUGIN_TIMEOUT_MS });
  if (result.timedOut || result.exitCode !== 0) {
    return {
      ok: false,
      outputPath,
      template: input.template,
      pluginId,
      ensure,
      errors: [formatDotnetFailure(result)],
      hints: ['Do not hand-write the plugin solution; retry create_plugin after ensure_plugin_templates succeeds.'],
    };
  }

  const actualId = await readGeneratedPluginId(pluginJsonPath, pluginId);
  return {
    ok: true,
    outputPath,
    template: input.template,
    pluginId: actualId,
    pluginJsonPath,
    ensure,
    errors: [],
    hints: [],
  };
}

async function readGeneratedPluginId(
  pluginJsonPath: string,
  fallback?: string,
): Promise<string | undefined> {
  try {
    const text = await readFile(pluginJsonPath, 'utf8');
    const parsed = parsePluginJsonText(text);
    if (parsed.ok && typeof parsed.value.id === 'string' && parsed.value.id.trim()) {
      return parsed.value.id.trim();
    }
  } catch {
    // fall through
  }
  return fallback;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
