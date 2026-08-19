import {
  formatDotnetFailure,
  INSTALL_TEMPLATE_TIMEOUT_MS,
  runDotnet,
  type DotnetRunner,
} from './dotnet.js';
import {
  compareNuGetVersions,
  fetchLatestPackageVersion,
  nugetSourceArgs,
  TEMPLATE_PACKAGE_ID,
  type JsonFetcher,
} from './nuget-source.js';

export interface InstalledTemplateSource {
  name: string;
  version?: string;
  templates: string[];
  uninstallCommand?: string;
  isFolder: boolean;
}

export interface EnsureTemplatesResult {
  ok: boolean;
  installed: boolean;
  updated: boolean;
  source?: 'nuget' | 'folder';
  package?: string;
  currentVersion?: string;
  latestVersion?: string;
  folderPath?: string;
  errors: string[];
  hints: string[];
}

export interface EnsureTemplatesDeps {
  runDotnet: DotnetRunner;
  fetchLatestVersion: (
    packageId: string,
    sourceUrl?: string,
  ) => Promise<string | undefined>;
  env?: NodeJS.ProcessEnv;
}

export function defaultEnsureTemplatesDeps(
  env: NodeJS.ProcessEnv = process.env,
  fetchJson?: JsonFetcher,
): EnsureTemplatesDeps {
  return {
    runDotnet,
    env,
    fetchLatestVersion: (packageId, sourceUrl) =>
      fetchLatestPackageVersion(packageId, sourceUrl, fetchJson),
  };
}

export async function ensurePluginTemplates(
  deps: EnsureTemplatesDeps = defaultEnsureTemplatesDeps(),
): Promise<EnsureTemplatesResult> {
  const env = deps.env ?? process.env;
  const listResult = await deps.runDotnet(['new', 'list', 'miokit']);
  const uninstallResult = await deps.runDotnet(['new', 'uninstall']);

  const sources = parseInstalledTemplateSources(uninstallResult.stdout);
  const miokitSources = sources.filter(isMioKitTemplateSource);
  const folderSources = miokitSources.filter((item) => item.isFolder);

  if (folderSources.length > 0 || hasFolderHintInList(listResult.stdout)) {
    const folderPath =
      folderSources[0]?.name ?? extractFolderPathFromList(listResult.stdout) ?? 'local folder';
    return {
      ok: false,
      installed: true,
      updated: false,
      source: 'folder',
      folderPath,
      errors: [
        `MioKit templates are installed from a local folder (${folderPath}). Uninstall the folder source and keep only the NuGet package.`,
      ],
      hints: [
        `dotnet new uninstall "${folderPath}"`,
        `Then install from NuGet only: dotnet new install ${TEMPLATE_PACKAGE_ID}`,
        'Do not run dotnet new install <local-folder>.',
      ],
    };
  }

  const nugetSource = miokitSources.find((item) => !item.isFolder);
  const listed = listHasMioKitTemplates(listResult.stdout);
  const installed = Boolean(nugetSource) || listed;

  if (!installed) {
    const install = await installTemplates(undefined, deps, env);
    if (!install.ok) {
      return install;
    }
    const after = parseInstalledTemplateSources(
      (await deps.runDotnet(['new', 'uninstall'])).stdout,
    );
    const current = after.find((item) => item.name === TEMPLATE_PACKAGE_ID);
    return {
      ok: true,
      installed: true,
      updated: true,
      source: 'nuget',
      package: TEMPLATE_PACKAGE_ID,
      currentVersion: current?.version,
      latestVersion: current?.version,
      errors: [],
      hints: [],
    };
  }

  const currentVersion = nugetSource?.version;
  const sourceUrl = nugetSourceArgs(env)[1];
  let latestVersion: string | undefined;
  try {
    latestVersion = await deps.fetchLatestVersion(TEMPLATE_PACKAGE_ID, sourceUrl);
  } catch {
    latestVersion = undefined;
  }

  const needsUpdate =
    Boolean(latestVersion) &&
    (currentVersion === undefined ||
      compareNuGetVersions(latestVersion!, currentVersion) > 0);

  if (needsUpdate && latestVersion) {
    const install = await installTemplates(latestVersion, deps, env);
    if (!install.ok) {
      return { ...install, currentVersion, latestVersion };
    }
    return {
      ok: true,
      installed: true,
      updated: true,
      source: 'nuget',
      package: TEMPLATE_PACKAGE_ID,
      currentVersion: latestVersion,
      latestVersion,
      errors: [],
      hints: [],
    };
  }

  const hints: string[] = [];
  if (!latestVersion) {
    hints.push('Could not query the NuGet source for the latest MioKit.Plugin.Templates version; left the installed copy unchanged.');
  }

  return {
    ok: true,
    installed: true,
    updated: false,
    source: 'nuget',
    package: TEMPLATE_PACKAGE_ID,
    currentVersion,
    latestVersion: latestVersion ?? currentVersion,
    errors: [],
    hints,
  };
}

async function installTemplates(
  version: string | undefined,
  deps: EnsureTemplatesDeps,
  env: NodeJS.ProcessEnv,
): Promise<EnsureTemplatesResult> {
  const packageRef = version ? `${TEMPLATE_PACKAGE_ID}::${version}` : TEMPLATE_PACKAGE_ID;
  const args = ['new', 'install', packageRef, ...nugetSourceArgs(env)];
  const result = await deps.runDotnet(args, { timeoutMs: INSTALL_TEMPLATE_TIMEOUT_MS, env });
  if (result.timedOut || result.exitCode !== 0) {
    return {
      ok: false,
      installed: false,
      updated: false,
      errors: [formatDotnetFailure(result)],
      hints: [
        `Install ${TEMPLATE_PACKAGE_ID} from NuGet (nuget.org by default).`,
        'Do not pass a local folder to dotnet new install.',
      ],
    };
  }
  return {
    ok: true,
    installed: true,
    updated: true,
    source: 'nuget',
    package: TEMPLATE_PACKAGE_ID,
    currentVersion: version,
    latestVersion: version,
    errors: [],
    hints: [],
  };
}

export function parseInstalledTemplateSources(stdout: string): InstalledTemplateSource[] {
  const grouped = parseGroupedUninstallOutput(stdout);
  if (grouped.length > 0) {
    return grouped;
  }
  return parseTableUninstallOutput(stdout);
}

function parseGroupedUninstallOutput(stdout: string): InstalledTemplateSource[] {
  const lines = stdout.split(/\r?\n/);
  const start = lines.findIndex((line) => /currently installed items/i.test(line));
  if (start < 0) {
    return [];
  }

  const sources: InstalledTemplateSource[] = [];
  let current: InstalledTemplateSource | undefined;
  let section: 'none' | 'templates' | 'uninstall' = 'none';

  for (const raw of lines.slice(start + 1)) {
    if (raw.trim() === '') {
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const text = raw.trim();

    if (indent <= 2 && !raw.startsWith('\t') && indent < 4 && !text.startsWith('To ')) {
      if (/^[A-Za-z].*:$/.test(text) && indent >= 4) {
        continue;
      }
      if (indent <= 2 && text && !text.endsWith(':') && !text.startsWith('dotnet ')) {
        current = {
          name: text,
          templates: [],
          isFolder: isFolderSource(text),
        };
        sources.push(current);
        section = 'none';
        continue;
      }
    }

    if (!current) {
      continue;
    }

    if (/^(version|nugetversion):/i.test(text)) {
      current.version = text.slice(text.indexOf(':') + 1).trim() || undefined;
      section = 'none';
      continue;
    }
    if (/^templates:/i.test(text)) {
      section = 'templates';
      continue;
    }
    if (/^uninstall command:/i.test(text)) {
      section = 'uninstall';
      continue;
    }
    if (/^details:/i.test(text)) {
      section = 'none';
      continue;
    }

    if (section === 'templates') {
      current.templates.push(text);
    } else if (section === 'uninstall') {
      current.uninstallCommand = text;
    }
  }

  return sources;
}

function parseTableUninstallOutput(stdout: string): InstalledTemplateSource[] {
  const sources: InstalledTemplateSource[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('-') || /template/i.test(line) && /package/i.test(line)) {
      continue;
    }
    const pathMatch = line.match(/([A-Za-z]:[\\/][^\s]+|\/[^\s]+)/);
    if (pathMatch?.[1] && /miokit/i.test(line)) {
      sources.push({
        name: pathMatch[1],
        templates: [],
        isFolder: true,
      });
      continue;
    }
    if (/MioKit\.Plugin\.Templates/i.test(line)) {
      const version = line.match(/\b(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)\b/)?.[1];
      sources.push({
        name: TEMPLATE_PACKAGE_ID,
        version,
        templates: [],
        isFolder: false,
      });
    }
  }
  return dedupeSources(sources);
}

function dedupeSources(sources: InstalledTemplateSource[]): InstalledTemplateSource[] {
  const map = new Map<string, InstalledTemplateSource>();
  for (const source of sources) {
    map.set(source.name, source);
  }
  return [...map.values()];
}

export function isFolderSource(name: string): boolean {
  const trimmed = name.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return true;
  }
  return trimmed.includes('\\') || trimmed.includes('/');
}

function isMioKitTemplateSource(source: InstalledTemplateSource): boolean {
  if (/MioKit\.Plugin\.Templates/i.test(source.name)) {
    return true;
  }
  if (/miokit/i.test(source.name)) {
    return true;
  }
  return source.templates.some((item) => /miokit/i.test(item));
}

function listHasMioKitTemplates(stdout: string): boolean {
  return /miokit-plugin/i.test(stdout);
}

function hasFolderHintInList(stdout: string): boolean {
  return isFolderSource(stdout) && /miokit/i.test(stdout) && !/MioKit\.Plugin\.Templates/i.test(stdout);
}

function extractFolderPathFromList(stdout: string): string | undefined {
  const match = stdout.match(/([A-Za-z]:[\\/][^\s]+|\/[^\s]+)/);
  return match?.[1];
}
