import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, printerCtor } = vi.hoisted(() => {
  const executeMock = vi.fn();
  const printerCtor = vi.fn().mockImplementation(() => ({ execute: executeMock }));
  return { executeMock, printerCtor };
});

vi.mock('ipp', () => ({
  default: { Printer: printerCtor },
  Printer: printerCtor,
}));

import { createIppTransport } from '../../src/transports/ipp';

describe('ipp transport', () => {
  beforeEach(() => {
    executeMock.mockReset();
    printerCtor.mockClear();
  });

  it('sends a Print-Job request and reports success', async () => {
    executeMock.mockImplementation((_op, _msg, cb) =>
      cb(null, { 'status-code': 'successful-ok', 'job-attributes-tag': { 'job-id': 42 } }),
    );

    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '192.168.1.50',
      port: 631,
      printerUrl: 'ipp://192.168.1.50:631/ipp/print',
      data: Buffer.from('%PDF-1.4 mock'),
      copies: 1,
    });

    expect(result.success).toBe(true);
    expect(printerCtor).toHaveBeenCalledWith('ipp://192.168.1.50:631/ipp/print');
    expect(executeMock).toHaveBeenCalledTimes(1);
    const [op, msg] = executeMock.mock.calls[0]!;
    expect(op).toBe('Print-Job');
    expect(msg.data).toEqual(Buffer.from('%PDF-1.4 mock'));
    expect(msg['operation-attributes-tag']['document-format']).toBe('application/pdf');
  });

  it('uses native IPP copies attribute when copies > 1', async () => {
    executeMock.mockImplementation((_op, _msg, cb) => cb(null, { 'status-code': 'successful-ok' }));

    const transport = createIppTransport({ timeoutMs: 5000 });
    await transport.send({
      protocol: 'ipp',
      ip: '192.168.1.50',
      port: 631,
      printerUrl: 'ipp://192.168.1.50:631/ipp/print',
      data: Buffer.from('x'),
      copies: 5,
    });

    expect(executeMock).toHaveBeenCalledTimes(1);
    const msg = executeMock.mock.calls[0]![1];
    expect(msg['job-attributes-tag']?.copies).toBe(5);
  });

  it('builds printer url from ip + port when printerUrl is missing', async () => {
    executeMock.mockImplementation((_op, _msg, cb) => cb(null, { 'status-code': 'successful-ok' }));

    const transport = createIppTransport({ timeoutMs: 5000 });
    await transport.send({
      protocol: 'ipp',
      ip: '10.0.0.5',
      port: 631,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(printerCtor).toHaveBeenCalledWith('ipp://10.0.0.5:631/ipp/print');
  });

  it('maps non-OK status-code to PRINTER_ERROR', async () => {
    executeMock.mockImplementation((_op, _msg, cb) =>
      cb(null, { 'status-code': 'client-error-not-found' }),
    );

    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '192.168.1.50',
      port: 631,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PRINTER_ERROR');
    expect(result.error).toContain('client-error-not-found');
  });

  it('maps connection error to REFUSED/UNREACHABLE', async () => {
    executeMock.mockImplementation((_op, _msg, cb) => {
      const err: NodeJS.ErrnoException = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      cb(err);
    });

    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '192.168.1.50',
      port: 631,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REFUSED');
  });
});
