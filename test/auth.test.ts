import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createAuthMiddleware } from '../src/auth';
import { createLogger, type Logger } from '../src/logger';

function makeApp(apiKey: string, logger?: Logger) {
  const app = express();
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use(createAuthMiddleware(apiKey, logger));
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines: () => chunks.join('').split('\n').filter(Boolean) };
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

  it('logs auth-rejection with x-forwarded-for chain on 401', async () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'warn' }, stream);
    await request(makeApp('secret', log))
      .get('/protected')
      .set('authorization', 'Bearer wrong')
      .set('x-forwarded-for', '203.0.113.5, 198.51.100.1');

    const entries = lines().map((l) => JSON.parse(l));
    const rejection = entries.find((e) => e.msg === 'auth-rejection');
    expect(rejection).toBeDefined();
    expect(rejection.xff).toBe('203.0.113.5, 198.51.100.1');
    expect(rejection.reason).toBe('token-mismatch');
  });

  it('logs auth-rejection when authorization header is missing', async () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'warn' }, stream);
    await request(makeApp('secret', log)).get('/protected');

    const entries = lines().map((l) => JSON.parse(l));
    const rejection = entries.find((e) => e.msg === 'auth-rejection');
    expect(rejection).toBeDefined();
    expect(rejection.reason).toBe('missing-or-malformed-authorization');
  });
});
