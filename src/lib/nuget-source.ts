export const NUGET_ORG_FLAT_CONTAINER = 'https://api.nuget.org/v3-flatcontainer';
export const MIOKIT_NUGET_URL_ENV = 'miokit-nuget-url';
export const TEMPLATE_PACKAGE_ID = 'MioKit.Plugin.Templates';

export function getNugetSourceOverride(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[MIOKIT_NUGET_URL_ENV]?.trim();
  return value ? value : undefined;
}

export function nugetSourceArgs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const source = getNugetSourceOverride(env);
  return source ? ['--nuget-source', source] : [];
}

interface NugetServiceIndex {
  resources?: Array<{ '@id'?: string; '@type'?: string }>;
}

interface FlatContainerIndex {
  versions?: string[];
}

export type JsonFetcher = (url: string) => Promise<unknown>;

export async function defaultJsonFetcher(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export async function fetchLatestPackageVersion(
  packageId: string,
  sourceUrl?: string,
  fetchJson: JsonFetcher = defaultJsonFetcher,
): Promise<string | undefined> {
  const id = packageId.toLowerCase();
  const urls = await resolveVersionIndexUrls(id, sourceUrl, fetchJson);

  for (const url of urls) {
    try {
      const data = (await fetchJson(url)) as FlatContainerIndex;
      const versions = data.versions;
      if (Array.isArray(versions) && versions.length > 0) {
        return versions[versions.length - 1];
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

async function resolveVersionIndexUrls(
  packageIdLower: string,
  sourceUrl: string | undefined,
  fetchJson: JsonFetcher,
): Promise<string[]> {
  if (!sourceUrl) {
    return [`${NUGET_ORG_FLAT_CONTAINER}/${packageIdLower}/index.json`];
  }

  const trimmed = sourceUrl.replace(/\/+$/, '');
  const urls: string[] = [];

  try {
    const index = (await fetchJson(trimmed)) as NugetServiceIndex;
    const resources = index.resources ?? [];
    const base = resources.find((resource) =>
      String(resource['@type'] ?? '').includes('PackageBaseAddress'),
    );
    const baseId = base?.['@id']?.replace(/\/+$/, '');
    if (baseId) {
      urls.push(`${baseId}/${packageIdLower}/index.json`);
    }
  } catch {
    // source URL may not be a service index
  }

  urls.push(`${trimmed}/v3-flatcontainer/${packageIdLower}/index.json`);
  urls.push(`${trimmed}/${packageIdLower}/index.json`);
  return urls;
}

interface ParsedNuGetVersion {
  nums: number[];
  pre?: string;
}

export function compareNuGetVersions(a: string, b: string): number {
  const pa = parseNuGetVersion(a);
  const pb = parseNuGetVersion(b);
  const length = Math.max(pa.nums.length, pb.nums.length, 4);
  for (let i = 0; i < length; i++) {
    const da = pa.nums[i] ?? 0;
    const db = pb.nums[i] ?? 0;
    if (da !== db) {
      return da - db;
    }
  }
  if (!pa.pre && pb.pre) {
    return 1;
  }
  if (pa.pre && !pb.pre) {
    return -1;
  }
  if (pa.pre && pb.pre) {
    return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
  }
  return 0;
}

function parseNuGetVersion(value: string): ParsedNuGetVersion {
  const [main, ...rest] = value.trim().split('-');
  const pre = rest.length > 0 ? rest.join('-') : undefined;
  const nums = (main ?? '')
    .split('.')
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  return { nums, pre };
}
