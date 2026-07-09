import fs from 'fs/promises';
import path from 'path';
import spawn from 'cross-spawn';

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }

  return out;
}

export async function findOpencodeBin(): Promise<string> {
  const npmOpencodeExe = process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    : '';

  if (npmOpencodeExe) {
    try {
      await fs.access(npmOpencodeExe);
      return npmOpencodeExe;
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
}

export function getEffectiveModel(configuredModel: string | undefined): string {
  const model = configuredModel || 'xai/grok-3-latest';
  return model.includes('/') ? model : `xai/${model}`;
}

export function runCommand(
  bin: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try { child.kill('SIGKILL'); } catch {}
          reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${bin}`));
        }, options.timeoutMs)
      : undefined;

    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      if (!timedOut) resolve({ stdout, stderr, code });
    });
  });
}
