import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthMiddleware } from '../src/auth';

function makeApp(apiKey: string) {
  const app = express();
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use(createAuthMiddleware(apiKey));
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createAuthMiddleware', () => {
  it('lets /api/health through without a token', async () => {
    const res = await request(makeApp('secret')).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('rejects protected route with no auth header', async () => {
    const res = await request(makeApp('secret')).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'unauthorized' });
  });

  it('rejects protected route with wrong scheme', async () => {
    const res = await request(makeApp('secret'))
      .get('/protected')
      .set('authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('rejects protected route with wrong token', async () => {
    const res = await request(makeApp('secret'))
      .get('/protected')
      .set('authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('accepts protected route with correct token', async () => {
    const res = await request(makeApp('secret'))
      .get('/protected')
      .set('authorization', 'Bearer secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('uses constant-time comparison (different-length tokens still rejected)', async () => {
    const res = await request(makeApp('secret'))
      .get('/protected')
      .set('authorization', 'Bearer s');
    expect(res.status).toBe(401);
  });
});
