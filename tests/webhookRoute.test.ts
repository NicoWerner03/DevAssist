import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

const originalEnv = {
  GITLAB_REQUIRE_SIGNATURE: process.env.GITLAB_REQUIRE_SIGNATURE,
  GITLAB_WEBHOOK_SIGNING_SECRET: process.env.GITLAB_WEBHOOK_SIGNING_SECRET,
  DEV_ASSIST_BOT_USERNAME: process.env.DEV_ASSIST_BOT_USERNAME,
};

process.env.GITLAB_REQUIRE_SIGNATURE = 'false';
delete process.env.GITLAB_WEBHOOK_SIGNING_SECRET;
process.env.DEV_ASSIST_BOT_USERNAME = 'dev-assist';

const { createGitLabWebhookRouter } = await import('../src/routes/gitlabWebhooks');

describe('GitLab webhook route', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let endpoint: string;

  before(async () => {
    const app = express();
    app.use(express.json({
      verify: (req: any, _res, buffer) => { req.rawBody = buffer; },
    }));
    app.use('/webhooks/gitlab', createGitLabWebhookRouter());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${address.port}/webhooks/gitlab/issues`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function post(payload: unknown): Promise<{ status: number; body: any }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }

  it('returns no-mention for unrelated issue events', async () => {
    const response = await post({
      object_kind: 'issue',
      project: { id: 123 },
      object_attributes: { iid: 42, title: 'Test', description: 'No command here' },
    });

    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { accepted: true, ignored: 'no-mention' });
  });

  it('returns self-authored for bot comments', async () => {
    const response = await post({
      object_kind: 'note',
      user: { username: 'dev-assist' },
      project: { id: 123 },
      issue: { iid: 42, title: 'Test' },
      object_attributes: { id: 1, note: '@dev-assist publish' },
    });

    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { accepted: true, ignored: 'self-authored' });
  });

  it('returns dev-assist-generated for generated comments', async () => {
    const response = await post({
      object_kind: 'note',
      user: { username: 'alice' },
      project: { id: 123 },
      issue: { iid: 42, title: 'Test' },
      object_attributes: { id: 2, note: '## Dev-Assist: Structured Proposal\n@dev-assist publish' },
    });

    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { accepted: true, ignored: 'dev-assist-generated' });
  });
});
