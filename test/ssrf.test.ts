import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isAllowedPrinterIp } from '../src/ssrf';

const DEFAULT_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
];

describe('isAllowedPrinterIp', () => {
  it('accepts a typical 192.168 LAN address', () => {
    expect(isAllowedPrinterIp('192.168.1.50', DEFAULT_CIDRS)).toBe(true);
  });

  it('accepts a 10/8 address', () => {
    expect(isAllowedPrinterIp('10.42.0.1', DEFAULT_CIDRS)).toBe(true);
  });

  it('accepts a 172.16 address inside the /12 range', () => {
    expect(isAllowedPrinterIp('172.20.10.5', DEFAULT_CIDRS)).toBe(true);
  });

  it('rejects a 172.32 address outside the /12 range', () => {
    expect(isAllowedPrinterIp('172.32.0.1', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects a public IP', () => {
    expect(isAllowedPrinterIp('8.8.8.8', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isAllowedPrinterIp('0.0.0.0', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects multicast (224.0.0.0/4)', () => {
    expect(isAllowedPrinterIp('224.0.0.1', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects 255.255.255.255 broadcast', () => {
    expect(isAllowedPrinterIp('255.255.255.255', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isAllowedPrinterIp('not-an-ip', DEFAULT_CIDRS)).toBe(false);
    expect(isAllowedPrinterIp('999.0.0.0', DEFAULT_CIDRS)).toBe(false);
    expect(isAllowedPrinterIp('', DEFAULT_CIDRS)).toBe(false);
  });

  it('rejects when allowlist is empty', () => {
    expect(isAllowedPrinterIp('192.168.1.1', [])).toBe(false);
  });

  it('property: every IP in 192.168.0.0/16 is accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 65535 }),
        (n) => {
          const a = (n >> 8) & 0xff;
          const b = n & 0xff;
          const ip = `192.168.${a}.${b}`;
          return isAllowedPrinterIp(ip, ['192.168.0.0/16']);
        },
      ),
    );
  });

  it('property: any IP outside 10/8 is rejected when only 10/8 is allowed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (a, b, c, d) => {
          const ip = `${a}.${b}.${c}.${d}`;
          return !isAllowedPrinterIp(ip, ['10.0.0.0/8']);
        },
      ),
    );
  });
});
