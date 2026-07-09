import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type AiProvider = 'mock' | 'opencode';

export interface Config {
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  devAssistMention: string;
  devAssistBotUsername: string;
  startTunnel: boolean;

  gitlab: {
    baseUrl: string;
    token?: string;
    useGlab: boolean;
    glabHostname?: string;
    requireSignature: boolean;
  };

  webhookSigningSecret?: string;

  ai: {
    provider: AiProvider;
    model?: string;
    timeoutMs: number;
    reasoningEffort?: string;
  };

  contextOutputDir: string;
  processingDedupTtlMs: number;
}

function getEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

export function getConfig(): Config {
  const port = parseInt(getEnv('PORT', '5000')!, 10);
  const logLevel = (getEnv('LOG_LEVEL', 'info') as Config['logLevel']) || 'info';

  const devAssistMention = getEnv('DEV_ASSIST_MENTION', '@dev-assist')!;
  const devAssistBotUsername = getEnv(
    'DEV_ASSIST_BOT_USERNAME',
    devAssistMention.replace(/^@+/, '')
  )!;
  const startTunnel = getEnv('START_TUNNEL', 'false')!.toLowerCase() === 'true';

  const gitlab = {
    baseUrl: getEnv('GITLAB_BASE_URL', 'https://gitlab.com')!,
    token: getEnv('GITLAB_TOKEN'),
    useGlab: getEnv('GITLAB_USE_GLAB', 'true')!.toLowerCase() === 'true',
    glabHostname: getEnv('GITLAB_GLAB_HOSTNAME'),
    requireSignature: getEnv('GITLAB_REQUIRE_SIGNATURE', 'false')!.toLowerCase() === 'true',
  };

  const webhookSigningSecret = getEnv('GITLAB_WEBHOOK_SIGNING_SECRET');

  const aiProvider = (getEnv('AI_PROVIDER', 'mock') as AiProvider) || 'mock';
  const ai = {
    provider: aiProvider,
    model: getEnv('AI_MODEL'),
    timeoutMs: parseInt(getEnv('AI_TIMEOUT_MS', '120000')!, 10),
    reasoningEffort: getEnv('AI_REASONING_EFFORT'), // 'low' | 'medium' | 'high' (for supported xAI models)
  };

  const contextOutputDir = getEnv('CONTEXT_OUTPUT_DIR', '.dev-assist/issues')!;
  const processingDedupTtlMs = parseInt(getEnv('PROCESSING_DEDUP_TTL_MS', '300000')!, 10);

  return {
    port,
    logLevel,
    devAssistMention,
    devAssistBotUsername,
    startTunnel,
    gitlab,
    webhookSigningSecret,
    ai,
    contextOutputDir,
    processingDedupTtlMs,
  };
}
