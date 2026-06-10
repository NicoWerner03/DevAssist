import { Router, Request, Response } from 'express';

export function createHealthRouter() {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'dev-assist', time: new Date().toISOString() });
  });

  return router;
}
