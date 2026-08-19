import { emptyReport, type CheckReport } from './check-report.js';
import { PLUGIN_ID_PATTERN } from './plugin-id.js';

export const REQUIRED_PLUGIN_JSON_FIELDS = [
  'metadataVersion',
  'id',
  'name',
  'assembly',
  'minSdkVersion',
] as const;

export const FORBIDDEN_PLUGIN_JSON_FIELDS = [
  'pluginVersion',
  'releaseState',
  'releaseDate',
] as const;

export const VERSION_PLUGIN_JSON_FIELDS = [
  'minSdkVersion',
  'maxSdkVersion',
  'minHostVersion',
  'maxHostVersion',
] as const;

export interface NugetDependent {
  id: string;
  version?: string;
}

export interface PluginJson {
  metadataVersion?: unknown;
  id?: unknown;
  name?: unknown;
  assembly?: unknown;
  minSdkVersion?: unknown;
  maxSdkVersion?: unknown;
  minHostVersion?: unknown;
  maxHostVersion?: unknown;
  icon?: unknown;
  nugetDependents?: unknown;
  pluginVersion?: unknown;
  releaseState?: unknown;
  releaseDate?: unknown;
  [key: string]: unknown;
}

const SYSTEM_VERSION_PATTERN = /^\d+\.\d+(\.\d+){0,2}$/;

export function isSystemVersion(value: string): boolean {
  return SYSTEM_VERSION_PATTERN.test(value);
}

export function parsePluginJsonText(
  text: string,
): { ok: true; value: PluginJson } | { ok: false; error: string } {
  const stripped = text.replace(/^\uFEFF/, '');
  try {
    const value = JSON.parse(stripped) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'plugin.json must be a JSON object' };
    }
    return { ok: true, value: value as PluginJson };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `plugin.json is not valid JSON: ${message}` };
  }
}

export function validatePluginJsonText(text: string): CheckReport {
  const parsed = parsePluginJsonText(text);
  if (!parsed.ok) {
    return { errors: [parsed.error], warnings: [], hints: [] };
  }
  return validatePluginJson(parsed.value);
}

export function validatePluginJson(value: PluginJson): CheckReport {
  const report = emptyReport();

  for (const field of REQUIRED_PLUGIN_JSON_FIELDS) {
    if (!isNonEmptyString(value[field])) {
      report.errors.push(`Required field "${field}" must be a non-empty string`);
    }
  }

  for (const field of FORBIDDEN_PLUGIN_JSON_FIELDS) {
    if (field in value && value[field] !== undefined) {
      report.errors.push(
        `Forbidden field "${field}" must not appear; plugin version and release state come from NuGet PackageVersion only`,
      );
    }
  }

  for (const field of VERSION_PLUGIN_JSON_FIELDS) {
    const raw = value[field];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    if (typeof raw !== 'string' || !isSystemVersion(raw)) {
      report.errors.push(
        `"${field}" must be a System.Version value (major.minor[.build[.revision]]) with no SemVer suffix`,
      );
    }
  }

  if (isNonEmptyString(value.id) && !PLUGIN_ID_PATTERN.test(value.id)) {
    report.warnings.push(
      `id "${value.id}" does not match the suggested form com.<org>.plugin.<slug>`,
    );
    report.hints.push(
      'Use suggest_plugin_id (or create_plugin with org) to generate a stable plugin id',
    );
  }

  return report;
}

export function readNugetDependents(value: PluginJson): NugetDependent[] {
  const raw = value.nugetDependents;
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: NugetDependent[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && isNonEmptyString((item as NugetDependent).id)) {
      result.push({
        id: (item as NugetDependent).id,
        version: isNonEmptyString((item as NugetDependent).version)
          ? (item as NugetDependent).version
          : undefined,
      });
    }
  }
  return result;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
