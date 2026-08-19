import path from 'node:path';
import { readdir } from 'node:fs/promises';
import {
  formatDotnetFailure,
  PACK_TIMEOUT_MS,
  runDotnet,
  type DotnetRunner,
} from './dotnet.js';
import {
  inspectPluginNupkgFile,
  WEBVIEW2_BUILD_HINT,
  type InspectNupkgResult,
} from './nupkg-inspect.js';
import {
  checkDevEnvironmentWith,
  pluginKindFromLayout,
  type CheckDevEnvironmentDeps,
  type CheckDevEnvironmentResult,
  type PluginKind,
} from './dev-environment.js';
import { PluginLayoutError, resolvePluginLayout } from './plugin-layout.js';

export interface PackPluginInput {
  solutionRoot: string;
  packageVersion: string;
  packageId?: string;
  inspect?: boolean;
}

export interface PackPluginResult {
  ok: boolean;
  nupkgPath?: string;
  packageId?: string;
  packageVersion?: string;
  environment?: CheckDevEnvironmentResult;
  inspect?: InspectNupkgResult;
  errors: string[];
  warnings: string[];
  hints: string[];
}

export interface PackPluginDeps {
  runDotnet: DotnetRunner;
  inspectNupkg?: typeof inspectPluginNupkgFile;
  checkEnvironment?: (kind: PluginKind) => Promise<CheckDevEnvironmentResult>;
  environment?: Partial<CheckDevEnvironmentDeps>;
}

export function defaultPackPluginDeps(): PackPluginDeps {
  return { runDotnet, inspectNupkg: inspectPluginNupkgFile };
}

export async function packPlugin(
  input: PackPluginInput,
  deps: PackPluginDeps = defaultPackPluginDeps(),
): Promise<PackPluginResult> {
  const inspectAfter = input.inspect !== false;
  let layout;
  try {
    layout = await resolvePluginLayout(input.solutionRoot);
  } catch (err) {
    if (err instanceof PluginLayoutError) {
      return {
        ok: false,
        errors: [err.message],
        warnings: [],
        hints: err.hints,
      };
    }
    throw err;
  }

  const kind = pluginKindFromLayout(layout.hasVueUi);
  const environment = await (deps.checkEnvironment
    ? deps.checkEnvironment(kind)
    : checkDevEnvironmentWith(kind, { runDotnet: deps.runDotnet, ...deps.environment }));
  if (!environment.ok) {
    return {
      ok: false,
      environment,
      errors: environment.errors,
      warnings: environment.warnings,
      hints: environment.hints,
    };
  }

  const packageId = input.packageId?.trim() || layout.projectName;
  const packageVersion = input.packageVersion.trim();
  const artifactsDir = path.join(layout.solutionRoot, 'artifacts');
  const warnings: string[] = [...environment.warnings];
  const hints: string[] = [...environment.hints];

  if (layout.hasVueUi && !layout.hasUiDist) {
    warnings.push('WebView2 frontend output plugin/ui/dist is missing');
    hints.push(WEBVIEW2_BUILD_HINT);
  }

  const args = [
    'pack',
    layout.csprojPath,
    '-c',
    'Release',
    `-p:PackageId=${packageId}`,
    `-p:PackageVersion=${packageVersion}`,
    '-o',
    artifactsDir,
  ];

  const result = await deps.runDotnet(args, {
    cwd: layout.solutionRoot,
    timeoutMs: PACK_TIMEOUT_MS,
  });

  if (result.timedOut || result.exitCode !== 0) {
    return {
      ok: false,
      packageId,
      packageVersion,
      environment,
      errors: [formatDotnetFailure(result)],
      warnings,
      hints,
    };
  }

  const nupkgPath = await findPackedNupkg(artifactsDir, packageId, packageVersion);
  if (!nupkgPath) {
    return {
      ok: false,
      packageId,
      packageVersion,
      environment,
      errors: [`dotnet pack succeeded but no nupkg was found in ${artifactsDir}`],
      warnings,
      hints,
    };
  }

  if (!inspectAfter) {
    return {
      ok: true,
      nupkgPath,
      packageId,
      packageVersion,
      environment,
      errors: [],
      warnings,
      hints,
    };
  }

  const inspectFn = deps.inspectNupkg ?? inspectPluginNupkgFile;
  const inspect = await inspectFn(nupkgPath, { expectWebView2: layout.hasVueUi });
  return {
    ok: inspect.ok,
    nupkgPath,
    packageId,
    packageVersion,
    environment,
    inspect,
    errors: inspect.ok ? [] : inspect.errors,
    warnings: [...warnings, ...inspect.warnings],
    hints: [...hints, ...inspect.hints],
  };
}

async function findPackedNupkg(
  artifactsDir: string,
  packageId: string,
  packageVersion: string,
): Promise<string | undefined> {
  const expected = path.join(artifactsDir, `${packageId}.${packageVersion}.nupkg`);
  try {
    const names = await readdir(artifactsDir);
    const expectedName = path.basename(expected).toLowerCase();
    const exact = names.find((name) => name.toLowerCase() === expectedName);
    if (exact) {
      return path.join(artifactsDir, exact);
    }
    const prefix = `${packageId}.`.toLowerCase();
    const fallback = names.find(
      (name) => name.toLowerCase().startsWith(prefix) && name.toLowerCase().endsWith('.nupkg'),
    );
    return fallback ? path.join(artifactsDir, fallback) : undefined;
  } catch {
    return undefined;
  }
}
