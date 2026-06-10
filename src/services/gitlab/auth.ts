import crypto from 'crypto';
import { getConfig } from '../../config';
import logger from '../../utils/logger';

export interface WebhookVerificationResult {
  ok: boolean;
  reason?: string;
}

export function verifyWebhookRequest(
  rawBody: Buffer | string,
  headers: Record<string, string | string[] | undefined>
): WebhookVerificationResult {
  const cfg = getConfig();
  const secret = cfg.webhookSigningSecret;

  // If no secret configured, we still accept (common in glab-only or dev setups), but warn once.
  if (!secret) {
    logger.warn('Webhook signature verification skipped (no GITLAB_WEBHOOK_SIGNING_SECRET)');
    // Optional legacy token header support
    const legacy = headers['x-gitlab-token'];
    if (legacy && cfg.gitlab.token && legacy === cfg.gitlab.token) {
      return { ok: true };
    }
    return { ok: true, reason: 'no-secret-configured' };
  }

  const signature = headers['x-gitlab-signature'] as string | undefined;
  const timestamp = headers['x-gitlab-timestamp'] as string | undefined;
  const instanceId = headers['x-gitlab-instance-id'] as string | undefined; // sometimes present

  if (!signature || !timestamp) {
    return { ok: false, reason: 'missing-signature-or-timestamp' };
  }

  // GitLab format (v1): hex(HMAC_SHA256(secret, `${timestamp}:${rawBody}`)) or similar variants.
  // We support the common "X-Gitlab-Signature" as direct hex hmac of raw body (some versions) and the timestamped variant.
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

  // Try timestamped first (recommended by GitLab docs for some events)
  const payload = `${timestamp}:${bodyStr}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    return { ok: true };
  }

  // Fallback: direct body hmac (older / some self-managed)
  const direct = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
  const directBuf = Buffer.from(direct);
  if (directBuf.length === signatureBuf.length && crypto.timingSafeEqual(directBuf, signatureBuf)) {
    return { ok: true };
  }

  logger.warn('Webhook signature mismatch', { hasTimestamp: !!timestamp, hasInstance: !!instanceId });
  return { ok: false, reason: 'signature-mismatch' };
}
