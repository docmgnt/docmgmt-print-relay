import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServer, Server } from 'node:net';
import { createLogger } from '../../src/logger';
import { createStatusRouter } from '../../src/routes/status';

const ALLOWED = ['127.0.0.0/8', '10.0.0.0/8', '192.168.0.0/16'];

async function startMockTcpServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  return {
    port: addr.port,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
      }),
  };
}

describe('status route', () => {
  it('returns online: true for an open TCP port', async () => {
    const log = createLogger({ level: 'fatal' });
    const mock = await startMockTcpServer();
    const app = express().use(
      createStatusRouter({
        logger: log,
        allowedCidrs: ALLOWED,
        ippGetState: vi.fn(),
      }),
    );
    const res = await request(app).get(
      `/api/printers/127.0.0.1/status?protocol=tcp&port=${mock.port}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ online: true, status: 'ready' });
    await mock.close();
  });

  it('returns online: false for a closed TCP port', async () => {
    const log = createLogger({ level: 'fatal' });
    const app = express().use(
      createStatusRouter({
        logger: log,
        allowedCidrs: ALLOWED,
        ippGetState: vi.fn(),
      }),
    );
    const res = await request(app).get('/api/printers/127.0.0.1/status?protocol=tcp&port=1');

    expect(res.status).toBe(200);
    expect(res.body.online).toBe(false);
  });

  it('rejects ssrf-blocked ips with 400', async () => {
    const log = createLogger({ level: 'fatal' });
    const app = express().use(
      createStatusRouter({
        logger: log,
        allowedCidrs: ALLOWED,
        ippGetState: vi.fn(),
      }),
    );
    const res = await request(app).get('/api/printers/8.8.8.8/status?protocol=tcp&port=9100');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in allowed CIDRs/);
  });

  it('delegates IPP status checks to ippGetState', async () => {
    const log = createLogger({ level: 'fatal' });
    const ippGetState = vi.fn().mockResolvedValue({ online: true, state: 'idle' });
    const app = express().use(
      createStatusRouter({ logger: log, allowedCidrs: ALLOWED, ippGetState }),
    );
    const res = await request(app).get('/api/printers/192.168.1.50/status?protocol=ipp&port=631');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ online: true, status: 'idle' });
    expect(ippGetState).toHaveBeenCalledWith({ ip: '192.168.1.50', port: 631 });
  });

  it('returns 400 on invalid query params', async () => {
    const log = createLogger({ level: 'fatal' });
    const app = express().use(
      createStatusRouter({ logger: log, allowedCidrs: ALLOWED, ippGetState: vi.fn() }),
    );
    const res = await request(app).get('/api/printers/192.168.1.50/status?protocol=lpd&port=9100');

    expect(res.status).toBe(400);
  });
});
