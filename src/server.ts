import type { ChildProcess } from 'child_process';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { startCloudflareTunnel } from './services/tunnel.js';
import logger, { setLogLevel } from './utils/logger.js';

const config = getConfig();

// Apply log level from config/env immediately
setLogLevel(config.logLevel);

// Early warning for opencode provider
if (config.ai.provider === 'opencode') {
  import('child_process').then(({ execSync }) => {
    try {
      execSync('opencode --version', { stdio: 'ignore' });
      logger.info('opencode CLI detected - will use dev-assist-analyzer agent');
    } catch {
      logger.warn('opencode CLI not found in PATH. Install with: npm install -g opencode-ai');
      logger.warn('Falling back to mock until the CLI is available.');
    }
  });
}

const app = createApp();
let tunnelProcess: ChildProcess | null = null;

const server = app.listen(config.port, () => {
  logger.info('Dev-Assist API started', {
    port: config.port,
    logLevel: config.logLevel,
    mention: config.devAssistMention,
    startTunnel: config.startTunnel,
    aiProvider: config.ai.provider,
    aiModel: config.ai.model,
    gitlab: {
      baseUrl: config.gitlab.baseUrl,
      useGlab: config.gitlab.useGlab,
      hasToken: Boolean(config.gitlab.token),
    },
    contextOutputDir: config.contextOutputDir,
  });
  logger.info('All events are logged to this console (stdout/stderr). Set LOG_LEVEL=debug for more detail.');

  if (config.startTunnel) {
    tunnelProcess = startCloudflareTunnel(config.port);
  }
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (tunnelProcess && !tunnelProcess.killed) {
    logger.info('Stopping Cloudflare Tunnel');
    tunnelProcess.kill();
  }

  server.close(() => {
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
