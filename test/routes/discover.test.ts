import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createLogger } from '../../src/logger';
import { createDiscoverRouter } from '../../src/routes/discover';

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

describe('discover route', () => {
  it('returns an empty list', async () => {
    const log = createLogger({ level: 'fatal' });
    const app = express().use(createDiscoverRouter({ logger: log }));
    const res = await request(app).get('/api/discover');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: [] });
  });

  it('logs discover-stub-called at debug when called', async () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'debug' }, stream);
    const app = express().use(createDiscoverRouter({ logger: log }));
    await request(app).get('/api/discover');

    const entries = lines().map((l) => JSON.parse(l));
    const stubLog = entries.find((e) => e.msg === 'discover-stub-called');
    expect(stubLog).toBeDefined();
    expect(stubLog.level).toBe(20); // pino debug
  });

  it('does not log at info level (silent under default config)', async () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'info' }, stream);
    const app = express().use(createDiscoverRouter({ logger: log }));
    await request(app).get('/api/discover');

    expect(lines()).toHaveLength(0);
  });
});
