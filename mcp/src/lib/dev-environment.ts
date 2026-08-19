import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_DOTNET_TIMEOUT_MS, runDotnet, type DotnetRunner } from './dotnet.js';
import { compareNuGetVersions } from './nuget-source.js';

export const REQUIRED_DOTNET_SDK_MAJOR = 10;

/** Edge WebView2 Evergreen Runtime client id. */
export const WEBVIEW2_EVERGREEN_GUID = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

export const DOTNET_SDK_HINT =
  'Install the .NET 10 SDK from https://dotnet.microsoft.com/download/dotnet/10.0 then restart the terminal so `dotnet` is on PATH.';

export const WEBVIEW2_RUNTIME_HINT =
  'Install the Microsoft Edge WebView2 Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/. This is the machine runtime, not the MioKit.Webview2 NuGet package.';

export const PNPM_HINT =
  'Install pnpm (npm install -g pnpm) so plugin/vue-ui can run pnpm install / pnpm build.';

export type PluginKind = 'standard' | 'webview2';

export function pluginKindFromTemplate(template: string): PluginKind {
  return template === 'miokit-plugin-webview2' ? 'webview2' : 'standard';
}

export function pluginKindFromLayout(hasVueUi: boolean): PluginKind {
  return hasVueUi ? 'webview2' : 'standard';
}

export interface CheckDevEnvironmentInput {
  kind?: PluginKind;
}

export interface DotnetSdkCheck {
  ok: boolean;
  versions: string[];
  selected?: string;
}

export interface WebView2Check {
  ok: boolean;
  version?: string;
  source?: string;
}

export interface PnpmCheck {
  ok: boolean;
  version?: string;
}

export interface CheckDevEnvironmentResult {
  ok: boolean;
  kind: PluginKind;
  dotnetSdk: DotnetSdkCheck;
  webView2?: WebView2Check;
  pnpm?: PnpmCheck;
  errors: string[];
  warnings: string[];
  hints: string[];
}

export interface WebView2RuntimeInfo {
  version?: string;
  source: string;
}

export interface CheckDevEnvironmentDeps {
  runDotnet: DotnetRunner;
  queryWebView2?: () => Promise<WebView2RuntimeInfo | undefined>;
  runPnpmVersion?: () => Promise<string | undefined>;
  platform?: NodeJS.Platform;
}

export function defaultCheckDevEnvironmentDeps(): CheckDevEnvironmentDeps {
  return {
    runDotnet,
    queryWebView2: queryWebView2Runtime,
    runPnpmVersion: readPnpmVersion,
    platform: process.platform,
  };
}

export async function checkDevEnvironment(
  input: CheckDevEnvironmentInput = {},
  deps: CheckDevEnvironmentDeps = defaultCheckDevEnvironmentDeps(),
): Promise<CheckDevEnvironmentResult> {
  const kind = input.kind ?? 'standard';
  const errors: string[] = [];
  const warnings: string[] = [];
  const hints: string[] = [];

  const dotnetSdk = await checkDotnet10Sdk(deps.runDotnet);
  if (!dotnetSdk.ok) {
    errors.push(
      dotnetSdk.versions.length === 0
        ? `.NET ${REQUIRED_DOTNET_SDK_MAJOR} SDK is not installed or \`dotnet\` is not on PATH.`
        : `.NET ${REQUIRED_DOTNET_SDK_MAJOR} SDK is required; found ${dotnetSdk.versions.join(', ')}.`,
    );
    hints.push(DOTNET_SDK_HINT);
  }

  let webView2: WebView2Check | undefined;
  let pnpm: PnpmCheck | undefined;

  if (kind === 'webview2') {
    const platform = deps.platform ?? process.platform;
    const query = deps.queryWebView2 ?? queryWebView2Runtime;
    const info = platform === 'win32' ? await query() : undefined;
    webView2 = {
      ok: Boolean(info),
      version: info?.version,
      source: info?.source,
    };

    if (platform !== 'win32') {
      errors.push('WebView2 plugins require Windows and the Microsoft Edge WebView2 Runtime.');
      hints.push(WEBVIEW2_RUNTIME_HINT);
    } else if (!webView2.ok) {
      errors.push('Microsoft Edge WebView2 Runtime is not installed.');
      hints.push(WEBVIEW2_RUNTIME_HINT);
    }

    const version = await (deps.runPnpmVersion ?? readPnpmVersion)();
    pnpm = { ok: Boolean(version), version };
    if (!pnpm.ok) {
      warnings.push('pnpm is not on PATH. WebView2 Vue UI (plugin/vue-ui) needs it to install and build.');
      hints.push(PNPM_HINT);
    }
  }

  return {
    ok: errors.length === 0,
    kind,
    dotnetSdk,
    webView2,
    pnpm,
    errors,
    warnings,
    hints,
  };
}

export function parseDotnetSdkList(stdout: string): string[] {
  const versions: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\s+\[/);
    if (match?.[1]) {
      versions.push(match[1]);
    }
  }
  return versions;
}

export function pickDotnetSdkMajor(versions: string[], major: number): string | undefined {
  const matched = versions.filter((version) => sdkMajor(version) === major);
  if (matched.length === 0) {
    return undefined;
  }
  return matched.reduce((best, current) =>
    compareNuGetVersions(current, best) > 0 ? current : best,
  );
}

export function parseRegSzValue(stdout: string, valueName: string): string | undefined {
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\s*${escaped}\\s+REG_\\w+\\s+(\\S+)`, 'im').exec(stdout);
  return match?.[1];
}

async function checkDotnet10Sdk(run: DotnetRunner): Promise<DotnetSdkCheck> {
  const result = await run(['--list-sdks'], { timeoutMs: DEFAULT_DOTNET_TIMEOUT_MS });
  if (result.timedOut || result.exitCode !== 0) {
    return { ok: false, versions: [] };
  }
  const versions = parseDotnetSdkList(result.stdout);
  const selected = pickDotnetSdkMajor(versions, REQUIRED_DOTNET_SDK_MAJOR);
  return { ok: Boolean(selected), versions, selected };
}

function sdkMajor(version: string): number {
  return Number.parseInt(version.split('.')[0] ?? '', 10);
}

const WEBVIEW2_REGISTRY_KEYS = [
  `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_EVERGREEN_GUID}`,
  `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_EVERGREEN_GUID}`,
  `HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_EVERGREEN_GUID}`,
  `HKCU\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_EVERGREEN_GUID}`,
];

export async function queryWebView2Runtime(): Promise<WebView2RuntimeInfo | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }

  for (const key of WEBVIEW2_REGISTRY_KEYS) {
    const stdout = await runRegQuery(key, 'pv');
    if (!stdout) {
      continue;
    }
    const version = parseRegSzValue(stdout, 'pv');
    if (version) {
      return { version, source: key };
    }
  }

  const dirs = [
    path.join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft',
      'EdgeWebView',
      'Application',
    ),
    path.join(
      process.env.ProgramFiles ?? 'C:\\Program Files',
      'Microsoft',
      'EdgeWebView',
      'Application',
    ),
  ];

  for (const dir of dirs) {
    try {
      const info = await stat(dir);
      if (info.isDirectory()) {
        return { source: dir };
      }
    } catch {
      // try next
    }
  }

  return undefined;
}

function runRegQuery(key: string, valueName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn('reg', ['query', key, '/v', valueName], { windowsHide: true });
    let stdout = '';
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(undefined);
    }, DEFAULT_DOTNET_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.on('error', () => {
      finish(undefined);
    });
    child.on('close', (code) => {
      finish(code === 0 ? stdout : undefined);
    });
  });
}

export async function readPnpmVersion(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(command, ['--version'], {
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(undefined);
    }, DEFAULT_DOTNET_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.on('error', () => {
      finish(undefined);
    });
    child.on('close', (code) => {
      const version = stdout.trim().split(/\r?\n/)[0]?.trim();
      finish(code === 0 && version ? version : undefined);
    });
  });
}

/** Used by tools that already have a DotnetRunner and may override env probes. */
export async function checkDevEnvironmentWith(
  kind: PluginKind,
  deps: Partial<CheckDevEnvironmentDeps> & { runDotnet?: DotnetRunner } = {},
): Promise<CheckDevEnvironmentResult> {
  return checkDevEnvironment(
    { kind },
    {
      ...defaultCheckDevEnvironmentDeps(),
      ...deps,
      runDotnet: deps.runDotnet ?? runDotnet,
    },
  );
}
