import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicWebhookUrl, startCloudflareTunnel } from '../src/services/tunnel';

describe('Cloudflare tunnel helper', () => {
  it('starts cloudflared for the configured local port', () => {
    const spawned: Array<{ command: string; args: string[] }> = [];
    const process = new EventEmitter() as any;
    process.stdout = new EventEmitter();
    process.stderr = new EventEmitter();
    process.kill = () => true;

    startCloudflareTunnel(5000, {
      spawnProcess: (command, args) => {
        spawned.push({ command, args });
        return process;
      },
    });

    assert.deepEqual(spawned, [
      {
        command: 'cloudflared',
        args: ['tunnel', '--url', 'http://localhost:5000'],
      },
    ]);
  });

  it('formats the public GitLab issue webhook URL', () => {
    const url = createPublicWebhookUrl('https://abc-123.trycloudflare.com');

    assert.equal(url, 'https://abc-123.trycloudflare.com/webhooks/gitlab/issues');
  });
});
