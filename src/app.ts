import express, { Request, Response, NextFunction } from 'express';
import { createHealthRouter } from './routes/health.js';
import { createIssueRouter } from './routes/issues.js';
import { createGitLabWebhookRouter } from './routes/gitlabWebhooks.js';
import logger from './utils/logger.js';

export function createApp() {
  const app = express();

  // Capture raw body for GitLab webhook signature verification (must be before json())
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  // Request logging middleware (everything to console)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      return next();
    }
    const started = Date.now();
    const gitlabEvent = req.get('X-Gitlab-Event') || null;
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      gitlabEvent,
    });

    res.on('finish', () => {
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      });
    });

    next();
  });

  app.use('/health', createHealthRouter());

  app.use('/webhooks/gitlab', createGitLabWebhookRouter());

  // Manual routes (stubs for now – real implementations delegate to processor/publisher)
  app.use('/api/issues', createIssueRouter());

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Basic error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { message: err?.message, stack: err?.stack?.split('\n').slice(0, 3) });
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
