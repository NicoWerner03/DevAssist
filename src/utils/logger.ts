export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function format(level: LogLevel, msg: string, ctx?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? ' ' + JSON.stringify(ctx) : '';
  return `[${ts}] [${level.toUpperCase()}] ${msg}${ctxStr}`;
}

export function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const line = format(level, msg, ctx);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
  setLogLevel,
  // Helper to create a child logger with base context (simple merge on each call)
  withContext: (base: Record<string, unknown>) => ({
    debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, { ...base, ...ctx }),
  }),
};

export default logger;
