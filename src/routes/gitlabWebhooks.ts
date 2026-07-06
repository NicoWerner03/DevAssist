import { Router, Request, Response } from 'express';
import { getConfig } from '../config.js';
import logger from '../utils/logger.js';
import { verifyWebhookRequest } from '../services/gitlab/auth.js';
import { parseGitLabWebhook } from '../services/gitlab/parser.js';
import { mentionGate } from '../services/gitlab/mention.js';
import { processFromWebhook } from '../services/processing/processor.js';
import { publishIssue } from '../services/processing/publisher.js';

const config = getConfig();

// Very simple in-memory dedup (keyed by a best-effort id from GitLab or hash of body)
const seen = new Map<string, number>(); // key -> timestamp

function makeDedupKey(parsed: any, body: any): string {
  // Prefer GitLab delivery headers if present on the raw req (we stash them in middleware if needed)
  const eventId = (body?.event_id || body?.object_attributes?.id || '').toString();
  return `${parsed.projectId}:${parsed.issueIid}:${parsed.kind}:${eventId || 'no-id'}`;
}

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < config.processingDedupTtlMs) {
    return true;
  }
  seen.set(key, now);
  // Opportunistic cleanup of old entries
  if (seen.size > 200) {
    for (const [k, ts] of seen) {
      if (now - ts > config.processingDedupTtlMs * 2) seen.delete(k);
    }
  }
  return false;
}

export function createGitLabWebhookRouter() {
  const router = Router();

  router.post('/issues', async (req: Request, res: Response) => {
    const raw = (req as any).rawBody || JSON.stringify(req.body || {});
    const verification = verifyWebhookRequest(raw, req.headers as any);

    if (!verification.ok) {
      logger.warn('Webhook signature verification failed', { reason: verification.reason });

      if (config.gitlab.requireSignature) {
        logger.error('Signature verification required, aborting request');
        return res.status(401).json({ error: 'invalid signature' });
      }

      // During development / manual testing we still want to process the payload
      // (GitLab webhooks without secret or with missing headers are common at the beginning).
      // In production with a properly configured webhook + secret you can make this stricter.
      logger.info('Continuing processing despite signature failure (development mode)');
    }

    const parsed = parseGitLabWebhook(req.body);
    const key = makeDedupKey(parsed, req.body);

    if (isDuplicate(key)) {
      logger.info('Duplicate webhook ignored', { key });
      return res.status(202).json({ accepted: true, duplicate: true });
    }

    if (!parsed.shouldProcess) {
      logger.info('Webhook ignored – no leading @dev-assist mention');
      return res.status(202).json({ accepted: true, ignored: 'no-mention' });
    }

    // Extra visibility for issue descriptions (user wants tolerant recognition when @dev-assist appears at the beginning of the ticket description,
    // regardless of font, size, bold (**), headings (##), lists, etc. — "hauptsache es steht @dev-assist")
    if (parsed.kind === 'issue' && parsed.description) {
      const full = String(parsed.description || '').trim();
      const firstLine = full.split(/\r?\n/).find(l => l.trim()) || '';
      const descStart = firstLine.slice(0, 150);
      logger.info('Issue webhook received - first content line of description for mention check', { firstLine: descStart });
    }

    logger.info('Dispatching dev-assist command', { command: parsed.command, projectId: parsed.projectId, issueIid: parsed.issueIid });

    // Fire and forget (GitLab only cares about quick 2xx)
    (async () => {
      try {
        if (parsed.command === 'publish') {
          await publishIssue(parsed.projectId, parsed.issueIid);
        } else {
          await processFromWebhook(parsed);
        }
      } catch (e: any) {
        logger.error('Async processing failed', { error: e.message, projectId: parsed.projectId, issueIid: parsed.issueIid });
      }
    })();

    res.status(202).json({ accepted: true, command: parsed.command });
  });

  return router;
}
