import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '../../src/routes/health';

describe('health route', () => {
  it('returns ok with version and uptime', async () => {
    const app = express().use(createHealthRouter({ version: '0.1.0' }));
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('does not require auth', async () => {
    const app = express().use(createHealthRouter({ version: '0.1.0' }));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});
