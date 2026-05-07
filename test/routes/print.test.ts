import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLogger } from '../../src/logger';
import { createPrintRouter } from '../../src/routes/print';
import type { Transport, TransportResult } from '../../src/transports';

const ALLOWED = ['10.0.0.0/8', '192.168.0.0/16'];

function makeApp(transport: Transport) {
  const log = createLogger({ level: 'fatal' });
  return express()
    .use(express.json({ limit: '20mb' }))
    .use(
      createPrintRouter({
        logger: log,
        allowedCidrs: ALLOWED,
        getTransport: () => transport,
      }),
    );
}

describe('print route', () => {
  let send: ReturnType<typeof vi.fn>;
  let transport: Transport;

  beforeEach(() => {
    send = vi.fn();
    transport = { send };
  });

  it('returns 200 with success body on a happy path (utf-8 data)', async () => {
    send.mockResolvedValue({ success: true, bytesWritten: 6 } satisfies TransportResult);
    const res = await request(makeApp(transport))
      .post('/api/print')
      .send({
        protocol: 'tcp',
        ip: '192.168.1.50',
        port: 9100,
        data: '^XA^XZ',
        encoding: 'utf-8',
        copies: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'printed', bytesWritten: 6 });
    expect(send).toHaveBeenCalledTimes(1);
    const job = send.mock.calls[0]![0];
    expect(job.protocol).toBe('tcp');
    expect(Buffer.isBuffer(job.data)).toBe(true);
    expect(job.data.toString('utf-8')).toBe('^XA^XZ');
  });

  it('decodes base64 data', async () => {
    send.mockResolvedValue({ success: true, bytesWritten: 6 });
    await request(makeApp(transport))
      .post('/api/print')
      .send({
        protocol: 'tcp',
        ip: '192.168.1.50',
        port: 9100,
        data: 'XlhBXlha', // base64 for '^XA^XZ'
        encoding: 'base64',
        copies: 1,
      });

    const job = send.mock.calls[0]![0];
    expect(job.data.toString('utf-8')).toBe('^XA^XZ');
  });

  it('returns 400 on invalid body', async () => {
    const res = await request(makeApp(transport))
      .post('/api/print')
      .send({ protocol: 'lpd', ip: 'x', port: 0, data: '', encoding: 'utf-8', copies: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 with PROTOCOL_ERROR for SSRF rejection', async () => {
    const res = await request(makeApp(transport))
      .post('/api/print')
      .send({
        protocol: 'tcp',
        ip: '8.8.8.8',
        port: 9100,
        data: 'x',
        encoding: 'utf-8',
        copies: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'printer ip not in allowed CIDRs',
      errorCode: 'PROTOCOL_ERROR',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 502 with errorCode when transport fails', async () => {
    send.mockResolvedValue({
      success: false,
      errorCode: 'REFUSED',
      error: 'connect ECONNREFUSED',
    } satisfies TransportResult);

    const res = await request(makeApp(transport))
      .post('/api/print')
      .send({
        protocol: 'tcp',
        ip: '192.168.1.50',
        port: 9100,
        data: 'x',
        encoding: 'utf-8',
        copies: 1,
      });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      success: false,
      error: 'connect ECONNREFUSED',
      errorCode: 'REFUSED',
    });
  });

  it('strips printerUrl if a caller sends it (SSRF defense in depth)', async () => {
    send.mockResolvedValue({ success: true, bytesWritten: 1 });
    await request(makeApp(transport))
      .post('/api/print')
      .send({
        protocol: 'ipp',
        ip: '192.168.1.50',
        port: 631,
        data: 'x',
        encoding: 'utf-8',
        copies: 1,
        printerUrl: 'http://attacker.example.com/exfiltrate',
      });

    const job = send.mock.calls[0]![0];
    // PrintJob no longer carries printerUrl — even if sent, it's stripped by zod
    expect((job as { printerUrl?: string }).printerUrl).toBeUndefined();
  });
});
