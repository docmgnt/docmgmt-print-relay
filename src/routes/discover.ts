import { Router } from 'express';
import type { Logger } from 'pino';

export interface DiscoverOptions {
  logger: Logger;
}

export function createDiscoverRouter(opts: DiscoverOptions): Router {
  const router = Router();
  router.get('/api/discover', (_req, res) => {
    opts.logger.debug('discover-stub-called');
    res.json({ found: [] });
  });
  return router;
}
