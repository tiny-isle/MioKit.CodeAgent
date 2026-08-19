import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export class PluginLayoutError extends Error {
  readonly hints: string[];

  constructor(message: string, hints: string[] = []) {
    super(message);
    this.name = 'PluginLayoutError';
    this.hints = hints;
  }
}

export interface PluginLayout {
  solutionRoot: string;
  pluginDir: string;
  pluginJsonPath: string;
  csprojPath: string;
  projectName: string;
  hasVueUi: boolean;
  hasUiDist: boolean;
}

export async function resolvePluginLayout(solutionRoot: string): Promise<PluginLayout> {
  const root = path.resolve(solutionRoot);
  const pluginDir = path.join(root, 'plugin');
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');

  if (!(await pathExists(pluginJsonPath))) {
    throw new PluginLayoutError(
      `No plugin/plugin.json under ${root}`,
      [
        'Pass the plugin solution root (the directory that contains plugin/).',
        'Create a plugin with create_plugin first if this workspace has no plugin yet.',
      ],
    );
  }

  if (!(await isDirectory(pluginDir))) {
    throw new PluginLayoutError(`Expected a plugin/ directory under ${root}`, [
      'Pass the plugin solution root (the directory that contains plugin/).',
    ]);
  }

  const entries = await readdir(pluginDir);
  const csprojNames = entries.filter(
    (name) =>
      name.toLowerCase().endsWith('.csproj') &&
      !name.toLowerCase().endsWith('.preview.csproj'),
  );

  if (csprojNames.length === 0) {
    throw new PluginLayoutError(`No plugin/*.csproj under ${root}`, [
      'Expected plugin/<Name>.csproj next to plugin.json (Preview projects are ignored).',
    ]);
  }
  if (csprojNames.length > 1) {
    throw new PluginLayoutError(
      `Multiple plugin/*.csproj files under ${root}: ${csprojNames.join(', ')}`,
      ['Keep a single plugin project csproj under plugin/.'],
    );
  }

  const csprojFile = csprojNames[0]!;
  const projectName = csprojFile.replace(/\.csproj$/i, '');
  const hasVueUi = await isDirectory(path.join(pluginDir, 'vue-ui'));
  const hasUiDist = await isDirectory(path.join(pluginDir, 'ui', 'dist'));

  return {
    solutionRoot: root,
    pluginDir,
    pluginJsonPath,
    csprojPath: path.join(pluginDir, csprojFile),
    projectName,
    hasVueUi,
    hasUiDist,
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}
