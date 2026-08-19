import { spawn } from 'node:child_process';

export interface DotnetRunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface DotnetRunResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type DotnetRunner = (
  args: string[],
  options?: DotnetRunOptions,
) => Promise<DotnetRunResult>;

export const DEFAULT_DOTNET_TIMEOUT_MS = 60_000;
export const CREATE_PLUGIN_TIMEOUT_MS = 120_000;
export const PACK_TIMEOUT_MS = 5 * 60_000;
export const INSTALL_TEMPLATE_TIMEOUT_MS = 120_000;

export async function runDotnet(
  args: string[],
  options: DotnetRunOptions = {},
): Promise<DotnetRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOTNET_TIMEOUT_MS;
  const env = options.env ? { ...process.env, ...options.env } : process.env;

  return new Promise((resolve) => {
    const child = spawn('dotnet', args, {
      cwd: options.cwd,
      env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        command: 'dotnet',
        args,
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: Error) => {
      stderr = stderr ? `${stderr}\n${err.message}` : err.message;
      finish(null);
    });
    child.on('close', (code) => {
      finish(code);
    });
  });
}

export function formatDotnetFailure(result: DotnetRunResult): string {
  const command = [result.command, ...result.args].join(' ');
  if (result.timedOut) {
    return `Timed out: ${command}`;
  }
  const detail = (result.stderr || result.stdout).trim();
  const suffix = detail ? `\n${detail}` : '';
  if (result.exitCode === null) {
    return `Failed to start ${command}.${suffix}`;
  }
  return `${command} exited with code ${result.exitCode}.${suffix}`;
}
