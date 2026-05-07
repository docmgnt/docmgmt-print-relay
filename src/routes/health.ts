import { Router } from 'express';

export interface HealthOptions {
  version: string;
}

export function createHealthRouter(opts: HealthOptions): Router {
  const router = Router();
  router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: opts.version, uptime: process.uptime() });
  });
  return router;
}
