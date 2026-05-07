import http from 'node:http';
import ipp from 'ipp';
import type { IppState } from '../routes/status';

interface IppStateRequestArgs {
  ip: string;
  port: number;
  /** Per-request timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
}

interface ParsedAttrs {
  'printer-attributes-tag'?: { 'printer-state'?: number };
  [k: string]: unknown;
}

const STATE_MAP: Record<number, IppState['state']> = {
  3: 'idle',
  4: 'processing',
  5: 'stopped',
};

export async function getIppState({
  ip,
  port,
  timeoutMs = 5000,
}: IppStateRequestArgs): Promise<IppState> {
  const printerUri = `ipp://${ip}:${port}/ipp/print`;
  const message = {
    version: '2.0',
    operation: 'Get-Printer-Attributes',
    'operation-attributes-tag': {
      'attributes-charset': 'utf-8',
      'attributes-natural-language': 'en-us',
      'printer-uri': printerUri,
      'requested-attributes': ['printer-state'],
    },
  };
  const body: Buffer = ipp.serialize(message as unknown as Parameters<typeof ipp.serialize>[0]);

  return new Promise<IppState>((resolve) => {
    let resolved = false;
    const safeResolve = (s: IppState): void => {
      if (resolved) return;
      resolved = true;
      resolve(s);
    };

    const req = http.request(
      {
        hostname: ip,
        port,
        path: '/ipp/print',
        method: 'POST',
        headers: {
          'Content-Type': 'application/ipp',
          'Content-Length': body.length.toString(),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          req.destroy();
          safeResolve({ online: false, state: 'unknown' });
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = ipp.parse(Buffer.concat(chunks)) as unknown as ParsedAttrs;
            const stateNum = parsed['printer-attributes-tag']?.['printer-state'];
            const state =
              typeof stateNum === 'number' ? (STATE_MAP[stateNum] ?? 'unknown') : 'unknown';
            safeResolve({ online: true, state });
          } catch {
            safeResolve({ online: false, state: 'unknown' });
          }
        });
        res.on('error', () => safeResolve({ online: false, state: 'unknown' }));
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      safeResolve({ online: false, state: 'unknown' });
    }, timeoutMs);

    req.on('error', () => {
      clearTimeout(timer);
      safeResolve({ online: false, state: 'unknown' });
    });
    req.on('close', () => clearTimeout(timer));

    req.write(body);
    req.end();
  });
}
