import { randomUUID } from 'node:crypto';

export interface GenerateGuidOptions {
  /** How many GUIDs to generate. Default: 1 */
  count?: number;
  /** Uppercase hex characters. Default: true */
  uppercase?: boolean;
  /** Keep RFC 4122 hyphens (8-4-4-4-12). Default: true */
  hyphens?: boolean;
}

const MIN_COUNT = 1;
const MAX_COUNT = 100;

export function generateGuid(options: GenerateGuidOptions = {}): string[] {
  const count = options.count ?? 1;
  const uppercase = options.uppercase ?? true;
  const hyphens = options.hyphens ?? true;

  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new RangeError(`count must be an integer between ${MIN_COUNT} and ${MAX_COUNT}`);
  }

  return Array.from({ length: count }, () => formatGuid(randomUUID(), { uppercase, hyphens }));
}

function formatGuid(
  uuid: string,
  options: Required<Pick<GenerateGuidOptions, 'uppercase' | 'hyphens'>>,
): string {
  let value = uuid;
  if (!options.hyphens) {
    value = value.replaceAll('-', '');
  }
  if (options.uppercase) {
    value = value.toUpperCase();
  }
  return value;
}
