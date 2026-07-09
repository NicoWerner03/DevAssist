export type GlabOutputFormat = 'json' | 'text';

function normalizeApiPath(arg: string): string {
  if (arg.startsWith('/projects/')) return arg.slice(1);
  if (arg.startsWith('/') && /^\/\d+/.test(arg)) return `projects${arg}`;
  return arg;
}

function normalizeHostname(hostname: string | undefined): string | undefined {
  const normalized = hostname
    ?.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');

  return normalized || undefined;
}

export function buildGlabApiArgs(
  args: string[],
  output: GlabOutputFormat,
  hostname?: string,
): string[] {
  const commandArgs = ['api', ...args.map(normalizeApiPath)];
  if (output === 'json') commandArgs.push('--output', 'json');

  const normalizedHostname = normalizeHostname(hostname);
  if (normalizedHostname && normalizedHostname !== 'gitlab.com' && !normalizedHostname.includes('://')) {
    commandArgs.push('--hostname', normalizedHostname);
  }

  return commandArgs;
}

export function parseGlabOutput(output: string, format: GlabOutputFormat): any {
  return format === 'json' ? JSON.parse(output || 'null') : output;
}
