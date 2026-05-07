import { describe, it, expect } from 'vitest';
import { PrintRequestBodySchema, StatusQuerySchema } from '../src/validation';

describe('PrintRequestBodySchema', () => {
  const valid = {
    protocol: 'tcp',
    ip: '192.168.1.50',
    port: 9100,
    data: 'ZPL bytes',
    encoding: 'utf-8',
    copies: 1,
  };

  it('accepts a minimal valid TCP request', () => {
    expect(PrintRequestBodySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an IPP request with printerUrl', () => {
    expect(
      PrintRequestBodySchema.safeParse({
        ...valid,
        protocol: 'ipp',
        port: 631,
        encoding: 'base64',
        printerUrl: 'ipp://192.168.1.50:631/ipp/print',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown protocol', () => {
    expect(PrintRequestBodySchema.safeParse({ ...valid, protocol: 'lpd' }).success).toBe(false);
  });

  it('rejects malformed ip', () => {
    expect(PrintRequestBodySchema.safeParse({ ...valid, ip: 'not-an-ip' }).success).toBe(false);
  });

  it('rejects port out of range', () => {
    expect(PrintRequestBodySchema.safeParse({ ...valid, port: 0 }).success).toBe(false);
    expect(PrintRequestBodySchema.safeParse({ ...valid, port: 70000 }).success).toBe(false);
  });

  it('rejects copies < 1 or > 100', () => {
    expect(PrintRequestBodySchema.safeParse({ ...valid, copies: 0 }).success).toBe(false);
    expect(PrintRequestBodySchema.safeParse({ ...valid, copies: 101 }).success).toBe(false);
  });

  it('rejects unknown encoding', () => {
    expect(PrintRequestBodySchema.safeParse({ ...valid, encoding: 'utf-16' }).success).toBe(false);
  });
});

describe('StatusQuerySchema', () => {
  it('accepts protocol + numeric port', () => {
    expect(StatusQuerySchema.safeParse({ protocol: 'tcp', port: 9100 }).success).toBe(true);
  });

  it('coerces port string from query string', () => {
    const r = StatusQuerySchema.safeParse({ protocol: 'ipp', port: '631' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.port).toBe(631);
  });

  it('rejects bad protocol', () => {
    expect(StatusQuerySchema.safeParse({ protocol: 'serial', port: 9100 }).success).toBe(false);
  });
});
