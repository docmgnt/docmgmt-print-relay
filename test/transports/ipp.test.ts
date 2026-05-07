import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http, { Server } from 'node:http';
import ipp from 'ipp';
import { createIppTransport } from '../../src/transports/ipp';

interface MockServer {
  port: number;
  receivedMessages: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}

interface MockServerOptions {
  /** IPP status code to return in the response body. Default: 'successful-ok'. */
  statusCode?: string;
  /** If true, never respond — used to verify the client-side timeout/cleanup. */
  hang?: boolean;
  /** If set, return this HTTP status instead of 200. */
  httpStatus?: number;
}

async function startMockIppServer(options: MockServerOptions = {}): Promise<MockServer> {
  const receivedMessages: Array<Record<string, unknown>> = [];
  const server: Server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      try {
        const parsed = ipp.parse(body) as Record<string, unknown>;
        receivedMessages.push(parsed);
      } catch {
        receivedMessages.push({ _parseError: true });
      }

      if (options.hang) return; // never respond

      if (options.httpStatus && options.httpStatus !== 200) {
        res.writeHead(options.httpStatus);
        res.end();
        return;
      }

      // Minimal IPP response: just the required header + operation-attributes-tag.
      // Adding job-attributes-tag here triggers a serializer bug in the `ipp`
      // package for some integer-typed attributes ('job-state') that we don't
      // need for these tests. The relay only inspects `statusCode`.
      const responseMessage = {
        version: '2.0',
        statusCode: options.statusCode ?? 'successful-ok',
        id: 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
      };

      const responseBody: Buffer = ipp.serialize(
        responseMessage as unknown as Parameters<typeof ipp.serialize>[0],
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(responseBody);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  return {
    port: addr.port,
    receivedMessages,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
      }),
  };
}

describe('ipp transport', () => {
  let mock: MockServer;

  afterEach(async () => {
    if (mock) await mock.close();
  });

  it('sends a Print-Job request and reports success', async () => {
    mock = await startMockIppServer();
    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('%PDF-1.4 mock'),
      copies: 1,
    });

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(13);
    expect(mock.receivedMessages).toHaveLength(1);
    const msg = mock.receivedMessages[0]!;
    expect(msg.operation).toBe('Print-Job');
    const opAttrs = msg['operation-attributes-tag'] as Record<string, unknown>;
    expect(opAttrs['document-format']).toBe('application/pdf');
    expect(opAttrs['printer-uri']).toBe(`ipp://127.0.0.1:${mock.port}/ipp/print`);
  });

  it('uses native IPP copies attribute when copies > 1', async () => {
    mock = await startMockIppServer();
    const transport = createIppTransport({ timeoutMs: 5000 });
    await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 5,
    });

    const msg = mock.receivedMessages[0]!;
    const jobAttrs = msg['job-attributes-tag'] as Record<string, unknown>;
    expect(jobAttrs.copies).toBe(5);
  });

  it('omits copies attribute when copies === 1', async () => {
    mock = await startMockIppServer();
    const transport = createIppTransport({ timeoutMs: 5000 });
    await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });

    const msg = mock.receivedMessages[0]!;
    const jobAttrs = msg['job-attributes-tag'] as Record<string, unknown> | undefined;
    expect(jobAttrs?.copies).toBeUndefined();
  });

  it('always derives URL from ip+port (printerUrl is not trusted)', async () => {
    mock = await startMockIppServer();
    const transport = createIppTransport({ timeoutMs: 5000 });
    // PrintJob no longer accepts printerUrl — passing extra fields is a TypeScript-time
    // check, but at runtime we verify the URI sent reflects ip+port only.
    await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });

    const msg = mock.receivedMessages[0]!;
    const opAttrs = msg['operation-attributes-tag'] as Record<string, unknown>;
    expect(opAttrs['printer-uri']).toBe(`ipp://127.0.0.1:${mock.port}/ipp/print`);
  });

  it('maps non-OK IPP status-code to PRINTER_ERROR', async () => {
    mock = await startMockIppServer({ statusCode: 'client-error-not-found' });
    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PRINTER_ERROR');
    expect(result.error).toContain('client-error-not-found');
  });

  it('returns REFUSED when nothing listens on the port', async () => {
    // Don't start the mock — just pick a port that's almost certainly unused.
    const transport = createIppTransport({ timeoutMs: 1000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: 1, // privileged port, will refuse
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(['REFUSED', 'UNREACHABLE']).toContain(result.errorCode);
  });

  it('returns PROTOCOL_ERROR on non-200 HTTP response', async () => {
    mock = await startMockIppServer({ httpStatus: 500 });
    const transport = createIppTransport({ timeoutMs: 5000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROTOCOL_ERROR');
    expect(result.error).toContain('http 500');
  });

  it('returns TIMEOUT and destroys the request when the printer hangs', async () => {
    mock = await startMockIppServer({ hang: true });
    const transport = createIppTransport({ timeoutMs: 100 });
    const start = Date.now();
    const result = await transport.send({
      protocol: 'ipp',
      ip: '127.0.0.1',
      port: mock.port,
      data: Buffer.from('x'),
      copies: 1,
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TIMEOUT');
    expect(elapsed).toBeLessThan(500); // resolved promptly, not waiting on printer
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });
});
