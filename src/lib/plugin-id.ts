export const PLUGIN_ID_PATTERN =
  /^com\.[a-z0-9]+(?:-[a-z0-9]+)*\.plugin\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeOrg(org: string): string {
  let value = org.trim().toLowerCase();
  value = value.replace(/^com\./, '');
  return slugify(value);
}

export interface SuggestPluginIdInput {
  org: string;
  name?: string;
  slug?: string;
}

export interface SuggestPluginIdResult {
  pluginId: string;
  org: string;
  slug: string;
}

export function suggestPluginId(input: SuggestPluginIdInput): SuggestPluginIdResult {
  const org = normalizeOrg(input.org);
  const slug = slugify(input.slug ?? input.name ?? '');
  if (!org) {
    throw new Error('org produced an empty slug; use letters or digits');
  }
  if (!slug) {
    throw new Error('name/slug produced an empty slug; use letters or digits');
  }
  return {
    pluginId: `com.${org}.plugin.${slug}`,
    org,
    slug,
  };
}
