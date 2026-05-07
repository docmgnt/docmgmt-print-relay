import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

const HEALTH_PATH = '/api/health';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // still do a constant-time op to mask length-based timing
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function createAuthMiddleware(apiKey: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.path === HEALTH_PATH) return next();

    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ', 2);
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    if (!safeEqual(token, apiKey)) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    return next();
  };
}
