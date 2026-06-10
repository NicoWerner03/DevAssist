import { createApp } from './app';
import { getConfig } from './config';
import logger, { setLogLevel } from './utils/logger';

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

app.listen(config.port, () => {
  logger.info('Dev-Assist API started', {
    port: config.port,
    logLevel: config.logLevel,
    mention: config.devAssistMention,
    aiProvider: config.ai.provider,
    aiModel: config.ai.model,
    gitlab: {
      baseUrl: config.gitlab.baseUrl,
      useGlab: config.gitlab.useGlab,
      hasToken: Boolean(config.gitlab.token),
      writeBack: config.gitlab.writeBack,
    },
    contextOutputDir: config.contextOutputDir,
  });
  logger.info('All events are logged to this console (stdout/stderr). Set LOG_LEVEL=debug for more detail.');
});
