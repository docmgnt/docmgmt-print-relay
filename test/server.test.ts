import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildServer } from '../src/server';

function baseCfg() {
  return {
    apiKey: 'k',
    port: 0,
    logLevel: 'fatal' as const,
    allowedPrinterCidrs: ['127.0.0.0/8', '10.0.0.0/8'],
    tcpConnectTimeoutMs: 1000,
    tcpWriteTimeoutMs: 1000,
    ippTimeoutMs: 1000,
    version: '0.1.0',
  };
}

describe('buildServer', () => {
  it('serves /api/health without auth', async () => {
    const app = buildServer(baseCfg());

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0');
  });

  it('rejects /api/print without auth', async () => {
    const app = buildServer(baseCfg());
    const res = await request(app).post('/api/print').send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'unauthorized' });
  });

  it('returns 200 on a fully-authenticated round trip with mocked transport', async () => {
    const app = buildServer({
      ...baseCfg(),
      transportOverrides: {
        tcp: { send: async () => ({ success: true, bytesWritten: 1 }) },
      },
    });

    const res = await request(app)
      .post('/api/print')
      .set('authorization', 'Bearer k')
      .send({
        protocol: 'tcp',
        ip: '127.0.0.1',
        port: 9100,
        data: 'x',
        encoding: 'utf-8',
        copies: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 502 with errorCode when transport fails', async () => {
    const app = buildServer({
      ...baseCfg(),
      transportOverrides: {
        tcp: {
          send: async () => ({ success: false, errorCode: 'REFUSED', error: 'connection refused' }),
        },
      },
    });

    const res = await request(app)
      .post('/api/print')
      .set('authorization', 'Bearer k')
      .send({
        protocol: 'tcp',
        ip: '127.0.0.1',
        port: 9100,
        data: 'x',
        encoding: 'utf-8',
        copies: 1,
      });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      success: false,
      error: 'connection refused',
      errorCode: 'REFUSED',
    });
  });

  it('serves /api/discover with empty list when authenticated', async () => {
    const app = buildServer(baseCfg());
    const res = await request(app).get('/api/discover').set('authorization', 'Bearer k');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: [] });
  });

  it('rejects body over PRINT_BODY_SIZE_LIMIT (20mb)', async () => {
    const app = buildServer(baseCfg());
    // 21mb of "x" — should exceed the 20mb limit
    const oversized = 'x'.repeat(21 * 1024 * 1024);
    const res = await request(app)
      .post('/api/print')
      .set('authorization', 'Bearer k')
      .set('content-type', 'application/json')
      .send({ data: oversized });

    expect(res.status).toBe(413);
  });
});
