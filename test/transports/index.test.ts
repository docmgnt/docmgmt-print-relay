import { describe, it, expect, vi } from 'vitest';
import {
  registerTransport,
  getTransport,
  resetTransports,
  type Transport,
} from '../../src/transports';

describe('transport registry', () => {
  it('throws for an unknown protocol before registration', () => {
    resetTransports();
    expect(() => getTransport('tcp')).toThrow(/no transport registered/i);
  });

  it('returns a registered transport by protocol', () => {
    resetTransports();
    const fake: Transport = {
      send: vi.fn().mockResolvedValue({ success: true, bytesWritten: 10 }),
    };
    registerTransport('tcp', fake);
    expect(getTransport('tcp')).toBe(fake);
  });

  it('replaces an existing registration (last write wins)', () => {
    resetTransports();
    const a: Transport = { send: vi.fn() };
    const b: Transport = { send: vi.fn() };
    registerTransport('tcp', a);
    registerTransport('tcp', b);
    expect(getTransport('tcp')).toBe(b);
  });
});
