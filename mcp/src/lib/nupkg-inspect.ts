import { unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import { emptyReport, type CheckReport } from './check-report.js';
import {
  isNonEmptyString,
  parsePluginJsonText,
  readNugetDependents,
  validatePluginJson,
  type PluginJson,
} from './plugin-json.js';

export const HOST_SHARED_DLLS = [
  'MioKit.Sdk.dll',
  'MioKit.SourceGenerate.dll',
  'MioKit.Webview2.dll',
] as const;

export const ICON_PACK_HINT =
  '图标须同时 CopyToOutputDirectory + Pack，且 PackageIcon 与 plugin.json.icon 同路径';

export const WEBVIEW2_BUILD_HINT =
  'WebView2 插件打包前请在 plugin/vue-ui 运行 pnpm build，确保 ui/dist 进入包内';

const UNINSTALL_NAME_PATTERN = /(uninstall|cleanup)/i;
const UNINSTALL_SCRIPT_EXTENSIONS = new Set(['.dll', '.ps1', '.sh', '.bat', '.cmd']);

export interface InspectNupkgOptions {
  expectWebView2?: boolean;
}

export interface InspectNupkgResult extends CheckReport {
  ok: boolean;
  files: string[];
}

export async function inspectPluginNupkgFile(
  nupkgPath: string,
  options: InspectNupkgOptions = {},
): Promise<InspectNupkgResult> {
  const bytes = await readFile(nupkgPath);
  return inspectPluginNupkg(new Uint8Array(bytes), options);
}

export function inspectPluginNupkg(
  bytes: Uint8Array,
  options: InspectNupkgOptions = {},
): InspectNupkgResult {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      files: [],
      errors: [`Failed to read nupkg as zip: ${message}`],
      warnings: [],
      hints: ['A .nupkg is a zip archive; pass a file produced by pack_plugin / dotnet pack.'],
    };
  }

  const files = Object.keys(unzipped)
    .map(normalizeZipPath)
    .filter((name) => name.length > 0 && !name.endsWith('/'))
    .sort();
  const fileSet = new Set(files);
  const report = emptyReport();

  const pluginJsonEntry = findEntry(unzipped, 'plugin.json');
  if (!pluginJsonEntry || normalizeZipPath(pluginJsonEntry.name) !== 'plugin.json') {
    report.errors.push('nupkg root must contain plugin.json (plugin packages are not lib/<TFM>/ layout)');
    return finish(report, files);
  }

  const parsed = parsePluginJsonText(strFromU8(pluginJsonEntry.data));
  if (!parsed.ok) {
    report.errors.push(parsed.error);
    return finish(report, files);
  }

  const pluginJson = parsed.value;
  const jsonReport = validatePluginJson(pluginJson);
  report.errors.push(...jsonReport.errors);
  report.warnings.push(...jsonReport.warnings);
  report.hints.push(...jsonReport.hints);

  const assembly = isNonEmptyString(pluginJson.assembly) ? pluginJson.assembly.trim() : undefined;
  if (assembly && !fileSet.has(normalizeZipPath(assembly))) {
    report.errors.push(`nupkg root is missing assembly DLL "${assembly}" declared in plugin.json`);
  }

  checkIconAndResources(pluginJson, fileSet, unzipped, report);
  checkHostSharedDlls(files, report);
  checkPrivateDependencyDlls(pluginJson, files, assembly, report);
  checkUninstallArtifacts(files, report);
  checkWebView2Assets(files, options.expectWebView2 === true, report);
  checkNuspec(unzipped, report);

  return finish(report, files);
}

function finish(report: CheckReport, files: string[]): InspectNupkgResult {
  return {
    ok: report.errors.length === 0,
    files,
    errors: report.errors,
    warnings: report.warnings,
    hints: unique(report.hints),
  };
}

function checkIconAndResources(
  pluginJson: PluginJson,
  fileSet: Set<string>,
  unzipped: Record<string, Uint8Array>,
  report: CheckReport,
): void {
  if (!isNonEmptyString(pluginJson.icon)) {
    return;
  }
  const iconPath = normalizeZipPath(pluginJson.icon);
  if (!fileSet.has(iconPath)) {
    report.errors.push(`plugin.json.icon "${pluginJson.icon}" is not present in the nupkg`);
    report.hints.push(ICON_PACK_HINT);
  }

  const nuspec = readNuspec(unzipped);
  if (!nuspec) {
    return;
  }
  const nuspecIcon = nuspec.icon ? normalizeZipPath(nuspec.icon) : undefined;
  if (!nuspecIcon) {
    report.errors.push('nuspec is missing <icon>; it must match plugin.json.icon');
    report.hints.push(ICON_PACK_HINT);
  } else if (nuspecIcon !== iconPath) {
    report.errors.push(
      `nuspec <icon> "${nuspec.icon}" does not match plugin.json.icon "${pluginJson.icon}"`,
    );
    report.hints.push(ICON_PACK_HINT);
  }
}

function checkHostSharedDlls(files: string[], report: CheckReport): void {
  for (const file of files) {
    const base = basename(file);
    if ((HOST_SHARED_DLLS as readonly string[]).includes(base)) {
      report.errors.push(
        `nupkg must not contain host shared DLL "${base}"; reuse the host assembly instead`,
      );
    }
  }
}

function checkPrivateDependencyDlls(
  pluginJson: PluginJson,
  files: string[],
  assembly: string | undefined,
  report: CheckReport,
): void {
  const entryDll = assembly ? normalizeZipPath(assembly).toLowerCase() : undefined;
  const hostDlls = new Set(HOST_SHARED_DLLS.map((name) => name.toLowerCase()));
  const rootDlls = files.filter((file) => {
    if (!file.toLowerCase().endsWith('.dll') || file.includes('/')) {
      return false;
    }
    const lower = file.toLowerCase();
    if (entryDll && lower === entryDll) {
      return false;
    }
    if (hostDlls.has(lower)) {
      return false;
    }
    return true;
  });

  const dependents = readNugetDependents(pluginJson);
  const dependentIds = new Set(dependents.map((item) => item.id.toLowerCase()));

  for (const dll of rootDlls) {
    const stem = dll.slice(0, -4);
    const matched = dependents.some((item) => dllMatchesPackageId(stem, item.id));
    if (matched) {
      report.errors.push(
        `Private dependency DLL "${dll}" is packed into the nupkg while also listed in nugetDependents (dual source)`,
      );
    } else if (dependentIds.size === 0) {
      report.errors.push(
        `Private dependency DLL "${dll}" is packed without a nugetDependents entry`,
      );
    } else {
      report.errors.push(
        `Private dependency DLL "${dll}" is packed but not declared in nugetDependents`,
      );
    }
  }
}

function checkUninstallArtifacts(files: string[], report: CheckReport): void {
  for (const file of files) {
    if (isNugetMetadata(file)) {
      continue;
    }
    const ext = extension(file);
    const base = basename(file);
    if (ext === '.sql') {
      report.errors.push(
        `nupkg must not contain standalone SQL "${file}"; declare cleanup via PluginDataCleanupPlan instead`,
      );
      continue;
    }
    if (UNINSTALL_NAME_PATTERN.test(base) && UNINSTALL_SCRIPT_EXTENSIONS.has(ext)) {
      report.errors.push(
        `nupkg must not contain standalone uninstall/cleanup artifact "${file}"`,
      );
    }
  }
}

function checkWebView2Assets(
  files: string[],
  expectWebView2: boolean,
  report: CheckReport,
): void {
  const looksLikeWebView2 =
    expectWebView2 ||
    files.some(
      (file) =>
        file.startsWith('vue-ui/') ||
        file.startsWith('ui/') ||
        file.includes('PluginWebView'),
    );
  if (!looksLikeWebView2) {
    return;
  }
  const hasDist = files.some((file) => file.startsWith('ui/dist/') && !file.endsWith('/'));
  if (!hasDist) {
    report.errors.push('WebView2 plugin is missing built frontend static assets (ui/dist)');
    report.hints.push(WEBVIEW2_BUILD_HINT);
  }
}

function checkNuspec(unzipped: Record<string, Uint8Array>, report: CheckReport): void {
  const nuspec = readNuspec(unzipped);
  if (!nuspec) {
    report.warnings.push('nupkg has no .nuspec; skipped description envelope check');
    return;
  }
  if (!nuspec.description) {
    report.errors.push(
      'nuspec <description> is empty; it must be a miokit.plugin-package v1 JSON envelope',
    );
    return;
  }
  try {
    const envelope = JSON.parse(nuspec.description) as {
      schema?: unknown;
      schemaVersion?: unknown;
      plugin?: unknown;
    };
    if (envelope.schema !== 'miokit.plugin-package') {
      report.errors.push(
        `nuspec description schema must be "miokit.plugin-package", got ${JSON.stringify(envelope.schema)}`,
      );
    }
    if (envelope.schemaVersion !== 1) {
      report.errors.push(
        `nuspec description schemaVersion must be 1, got ${JSON.stringify(envelope.schemaVersion)}`,
      );
    }
    if (envelope.plugin === null || typeof envelope.plugin !== 'object' || Array.isArray(envelope.plugin)) {
      report.errors.push('nuspec description.plugin must be the plugin.json object');
    }
  } catch {
    report.errors.push(
      'nuspec <description> must be a miokit.plugin-package v1 JSON envelope, not HTML or free text',
    );
  }
}

interface NuspecInfo {
  icon?: string;
  description?: string;
}

function readNuspec(unzipped: Record<string, Uint8Array>): NuspecInfo | undefined {
  const entry = Object.entries(unzipped).find(([name]) => {
    const normalized = normalizeZipPath(name);
    return normalized.endsWith('.nuspec') && !normalized.includes('/');
  });
  if (!entry) {
    return undefined;
  }
  const xml = strFromU8(entry[1]);
  return {
    icon: xmlText(xml, 'icon'),
    description: xmlText(xml, 'description'),
  };
}

function xmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match?.[1]) {
    return undefined;
  }
  return decodeXml(match[1].trim()) || undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function findEntry(
  unzipped: Record<string, Uint8Array>,
  relativePath: string,
): { name: string; data: Uint8Array } | undefined {
  const wanted = normalizeZipPath(relativePath);
  for (const [name, data] of Object.entries(unzipped)) {
    if (normalizeZipPath(name) === wanted) {
      return { name, data };
    }
  }
  return undefined;
}

export function normalizeZipPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function basename(file: string): string {
  const parts = file.split('/');
  return parts[parts.length - 1] ?? file;
}

function extension(file: string): string {
  const base = basename(file);
  const index = base.lastIndexOf('.');
  return index >= 0 ? base.slice(index).toLowerCase() : '';
}

function isNugetMetadata(file: string): boolean {
  return (
    file === '[Content_Types].xml' ||
    file.startsWith('_rels/') ||
    file.startsWith('package/') ||
    file.endsWith('.nuspec')
  );
}

function dllMatchesPackageId(dllStem: string, packageId: string): boolean {
  const stem = dllStem.toLowerCase();
  const id = packageId.toLowerCase();
  if (stem === id) {
    return true;
  }
  const lastSegment = id.split('.').pop();
  return lastSegment !== undefined && lastSegment === stem;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
