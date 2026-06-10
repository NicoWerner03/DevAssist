import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyWebhookRequest } from '../src/services/gitlab/auth';

describe('GitLab Webhook Authentication', () => {
  let originalSecret: string | undefined;

  before(() => {
    originalSecret = process.env.GITLAB_WEBHOOK_SIGNING_SECRET;
  });

  after(() => {
    process.env.GITLAB_WEBHOOK_SIGNING_SECRET = originalSecret;
  });

  it('accepts requests when no signing secret is configured', () => {
    delete process.env.GITLAB_WEBHOOK_SIGNING_SECRET;

    const result = verifyWebhookRequest('{}', {});
    assert.equal(result.ok, true);
  });

  it('rejects requests when signature is missing but secret is configured', () => {
    process.env.GITLAB_WEBHOOK_SIGNING_SECRET = 'my-secret-key';

    const result = verifyWebhookRequest('{}', {});
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-signature-or-timestamp');
  });

  it('verifies valid timestamped signatures', () => {
    const secret = 'my-secret-key';
    process.env.GITLAB_WEBHOOK_SIGNING_SECRET = secret;

    const timestamp = '1234567890';
    const body = '{"event": "issue"}';
    const payload = `${timestamp}:${body}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const headers = {
      'x-gitlab-signature': signature,
      'x-gitlab-timestamp': timestamp,
    };

    const result = verifyWebhookRequest(body, headers);
    assert.equal(result.ok, true);
  });

  it('verifies valid direct legacy hmac signatures as fallback', () => {
    const secret = 'my-secret-key';
    process.env.GITLAB_WEBHOOK_SIGNING_SECRET = secret;

    const body = '{"event": "issue"}';
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const headers = {
      'x-gitlab-signature': signature,
      'x-gitlab-timestamp': '1234567890', // must still be present to pass initial headers check
    };

    const result = verifyWebhookRequest(body, headers);
    assert.equal(result.ok, true);
  });

  it('rejects invalid signature', () => {
    const secret = 'my-secret-key';
    process.env.GITLAB_WEBHOOK_SIGNING_SECRET = secret;

    const headers = {
      'x-gitlab-signature': 'wrong-signature-value',
      'x-gitlab-timestamp': '1234567890',
    };

    const result = verifyWebhookRequest('{}', headers);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'signature-mismatch');
  });
});
