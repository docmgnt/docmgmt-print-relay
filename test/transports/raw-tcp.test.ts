import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server } from 'node:net';
import { createRawTcpTransport } from '../../src/transports/raw-tcp';

interface MockServer {
  port: number;
  received: Buffer[];
  close: () => Promise<void>;
}

async function startMockPrinter(): Promise<MockServer> {
  const received: Buffer[] = [];
  const server: Server = createServer((socket) => {
    socket.on('data', (chunk) => received.push(chunk));
    socket.on('end', () => socket.end());
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  return {
    port: addr.port,
    received,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
      }),
  };
}

describe('raw-tcp transport', () => {
  let mock: MockServer;

  beforeEach(async () => {
    mock = await startMockPrinter();
  });

  afterEach(async () => {
    await mock.close();
  });

  it('sends bytes to the printer and reports success', async () => {
    const transport = createRawTcpTransport({ connectTimeoutMs: 2000, writeTimeoutMs: 2000 });
    const result = await transport.send({
      protocol: 'tcp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('^XA^XZ', 'utf-8'),
      copies: 1,
    });

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(6);
    // give the mock a tick to flush
    await new Promise((r) => setTimeout(r, 50));
    const all = Buffer.concat(mock.received).toString('utf-8');
    expect(all).toBe('^XA^XZ');
  });

  it('honors copies > 1 with serial sends', async () => {
    const transport = createRawTcpTransport({ connectTimeoutMs: 2000, writeTimeoutMs: 2000 });
    const result = await transport.send({
      protocol: 'tcp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('A', 'utf-8'),
      copies: 3,
    });

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(3);
    await new Promise((r) => setTimeout(r, 100));
    expect(Buffer.concat(mock.received).toString('utf-8')).toBe('AAA');
  });

  it('returns REFUSED for connect to closed port', async () => {
    await mock.close();
    const transport = createRawTcpTransport({ connectTimeoutMs: 1000, writeTimeoutMs: 1000 });
    const result = await transport.send({
      protocol: 'tcp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('REFUSED');
  });

  it('returns TIMEOUT or UNREACHABLE when connect exceeds connectTimeoutMs', async () => {
    // 10.255.255.1 is in 10/8 (private) but typically unreachable — connect hangs
    const transport = createRawTcpTransport({ connectTimeoutMs: 200, writeTimeoutMs: 200 });
    const result = await transport.send({
      protocol: 'tcp',
      ip: '10.255.255.1',
      port: 9100,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(['TIMEOUT', 'UNREACHABLE']).toContain(result.errorCode);
  });
});
