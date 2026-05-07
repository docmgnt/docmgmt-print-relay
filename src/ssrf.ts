import { isIP } from 'node:net';

interface ParsedCidr {
  base: number;
  mask: number;
  prefix: number;
}

function ipToInt(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function parseCidr(cidr: string): ParsedCidr | null {
  const [ip, prefixStr] = cidr.split('/');
  if (!ip || !prefixStr) return null;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const base = ipToInt(ip);
  if (base === null) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { base: base & mask, mask, prefix };
}

function isMulticast(ipInt: number): boolean {
  return (ipInt & 0xf0000000) === 0xe0000000;
}

function isBroadcast(ipInt: number): boolean {
  return ipInt === 0xffffffff;
}

function isUnspecified(ipInt: number): boolean {
  return ipInt === 0x00000000;
}

export function isAllowedPrinterIp(ip: string, allowedCidrs: string[]): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;
  if (isUnspecified(ipInt) || isMulticast(ipInt) || isBroadcast(ipInt)) return false;

  for (const cidr of allowedCidrs) {
    const parsed = parseCidr(cidr);
    if (parsed === null) continue;
    if ((ipInt & parsed.mask) === parsed.base) return true;
  }
  return false;
}
