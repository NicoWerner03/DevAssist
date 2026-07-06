import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig } from '../src/config';

describe('Runtime configuration', () => {
  let originalStartTunnel: string | undefined;
  let originalDevAssistMention: string | undefined;
  let originalDevAssistBotUsername: string | undefined;

  before(() => {
    originalStartTunnel = process.env.START_TUNNEL;
    originalDevAssistMention = process.env.DEV_ASSIST_MENTION;
    originalDevAssistBotUsername = process.env.DEV_ASSIST_BOT_USERNAME;
  });

  after(() => {
    process.env.START_TUNNEL = originalStartTunnel;
    process.env.DEV_ASSIST_MENTION = originalDevAssistMention;
    process.env.DEV_ASSIST_BOT_USERNAME = originalDevAssistBotUsername;
  });

  it('enables the Cloudflare tunnel when START_TUNNEL=true', () => {
    process.env.START_TUNNEL = 'true';

    const config = getConfig();

    assert.equal(config.startTunnel, true);
  });

  it('defaults the bot username to DEV_ASSIST_MENTION without @', () => {
    process.env.DEV_ASSIST_MENTION = '@dev-assist';
    delete process.env.DEV_ASSIST_BOT_USERNAME;

    const config = getConfig();

    assert.equal(config.devAssistBotUsername, 'dev-assist');
  });

  it('allows overriding the bot username separately from the mention', () => {
    process.env.DEV_ASSIST_MENTION = '@dev-assist';
    process.env.DEV_ASSIST_BOT_USERNAME = 'dev-assist-service';

    const config = getConfig();

    assert.equal(config.devAssistBotUsername, 'dev-assist-service');
  });
});
