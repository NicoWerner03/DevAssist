import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger.js';

const DEFAULT_WEBHOOK_PATH = '/webhooks/gitlab/issues';

type SpawnProcess = (command: string, args: string[]) => ChildProcess;

interface StartCloudflareTunnelOptions {
  spawnProcess?: SpawnProcess;
  webhookPath?: string;
}

function extractCloudflareTunnelUrl(output: string): string | undefined {
  return output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
}

export function createPublicWebhookUrl(tunnelUrl: string, webhookPath = DEFAULT_WEBHOOK_PATH): string {
  return `${tunnelUrl}${webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`}`;
}

export function startCloudflareTunnel(port: number, options: StartCloudflareTunnelOptions = {}): ChildProcess {
  const spawnProcess = options.spawnProcess ?? spawn;
  const webhookPath = options.webhookPath ?? DEFAULT_WEBHOOK_PATH;
  let tunnelUrlLogged = false;

  logger.info('Starting Cloudflare Tunnel');
  const tunnelProcess = spawnProcess('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);

  const parseTunnelOutput = (output: string) => {
    if (tunnelUrlLogged) return;

    const tunnelUrl = extractCloudflareTunnelUrl(output);
    if (!tunnelUrl) return;

    logger.info('Cloudflare Tunnel public webhook URL', {
      webhookUrl: createPublicWebhookUrl(tunnelUrl, webhookPath),
    });
    tunnelUrlLogged = true;
  };

  tunnelProcess.stdout?.on('data', (data) => parseTunnelOutput(data.toString()));
  tunnelProcess.stderr?.on('data', (data) => parseTunnelOutput(data.toString()));

  tunnelProcess.on('error', (err) => {
    logger.error('Failed to start Cloudflare Tunnel', { error: err.message });
  });

  tunnelProcess.on('close', (code) => {
    if (code !== null && code !== 0 && code !== 1) {
      logger.warn('Cloudflare Tunnel process exited unexpectedly', { code });
    }
  });

  return tunnelProcess;
}
