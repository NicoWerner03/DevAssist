import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig } from '../src/config';

describe('Runtime configuration', () => {
  let originalStartTunnel: string | undefined;

  before(() => {
    originalStartTunnel = process.env.START_TUNNEL;
  });

  after(() => {
    process.env.START_TUNNEL = originalStartTunnel;
  });

  it('enables the Cloudflare tunnel when START_TUNNEL=true', () => {
    process.env.START_TUNNEL = 'true';

    const config = getConfig();

    assert.equal(config.startTunnel, true);
  });
});
