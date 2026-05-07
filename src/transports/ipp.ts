import ipp from 'ipp';
import http from 'node:http';
import type { ErrorCode, PrintJob, Transport, TransportResult } from './index';

export interface IppOptions {
  timeoutMs: number;
}

interface IppMessage {
  version: string;
  operation: string;
  'operation-attributes-tag': Record<string, unknown>;
  'job-attributes-tag'?: Record<string, unknown>;
  data: Buffer;
}

interface ParsedIppResponse {
  // ipp.parse returns the IPP status as `statusCode` (camelCase) at the
  // top level; group attributes use kebab-case. See node_modules/ipp/lib/parser.js.
  statusCode?: string;
  [k: string]: unknown;
}

function mapErrorCode(
  err: NodeJS.ErrnoException | null,
  statusCode: string | undefined,
): ErrorCode {
  if (err) {
    if (err.code === 'ECONNREFUSED') return 'REFUSED';
    if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') return 'UNREACHABLE';
    if (err.code === 'ETIMEDOUT') return 'TIMEOUT';
    return 'PROTOCOL_ERROR';
  }
  if (statusCode && !statusCode.startsWith('successful-')) return 'PRINTER_ERROR';
  return 'PROTOCOL_ERROR';
}

function buildMessage(job: PrintJob, printerUri: string): IppMessage {
  return {
    version: '2.0',
    operation: 'Print-Job',
    'operation-attributes-tag': {
      'attributes-charset': 'utf-8',
      'attributes-natural-language': 'en-us',
      'printer-uri': printerUri,
      'requesting-user-name': 'docmgmt-print-relay',
      'job-name': 'docmgmt-job',
      'document-format': 'application/pdf',
    },
    'job-attributes-tag': job.copies > 1 ? { copies: job.copies } : {},
    data: job.data,
  };
}

export function createIppTransport(opts: IppOptions): Transport {
  return {
    async send(job: PrintJob): Promise<TransportResult> {
      // URL is derived from validated ip+port — printerUrl is never trusted.
      const printerUri = `ipp://${job.ip}:${job.port}/ipp/print`;
      const message = buildMessage(job, printerUri);
      const body: Buffer = ipp.serialize(message as unknown as Parameters<typeof ipp.serialize>[0]);

      return new Promise<TransportResult>((resolve) => {
        let resolved = false;
        const safeResolve = (r: TransportResult): void => {
          if (resolved) return;
          resolved = true;
          resolve(r);
        };

        const req = http.request(
          {
            hostname: job.ip,
            port: job.port,
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
              safeResolve({
                success: false,
                errorCode: 'PROTOCOL_ERROR',
                error: `http ${res.statusCode}`,
              });
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              try {
                const parsed = ipp.parse(Buffer.concat(chunks)) as unknown as ParsedIppResponse;
                const statusCode = parsed.statusCode;
                if (typeof statusCode === 'string' && statusCode.startsWith('successful-')) {
                  safeResolve({ success: true, bytesWritten: job.data.length });
                } else {
                  safeResolve({
                    success: false,
                    errorCode: mapErrorCode(null, statusCode),
                    error: `ipp status-code: ${statusCode ?? 'unknown'}`,
                  });
                }
              } catch (e) {
                safeResolve({
                  success: false,
                  errorCode: 'PROTOCOL_ERROR',
                  error: e instanceof Error ? e.message : 'parse failed',
                });
              }
            });
            res.on('error', (err: NodeJS.ErrnoException) => {
              safeResolve({
                success: false,
                errorCode: mapErrorCode(err, undefined),
                error: err.message,
              });
            });
          },
        );

        const timer = setTimeout(() => {
          // Critical: destroy the underlying request so the socket is freed
          // even if the printer never responds. Without this, FDs accumulate
          // against hung printers until the OS TCP keepalive (~2h) reaps them.
          req.destroy();
          safeResolve({
            success: false,
            errorCode: 'TIMEOUT',
            error: `ipp request exceeded ${opts.timeoutMs}ms`,
          });
        }, opts.timeoutMs);

        req.on('error', (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          safeResolve({
            success: false,
            errorCode: mapErrorCode(err, undefined),
            error: err.message,
          });
        });

        req.on('close', () => clearTimeout(timer));

        req.write(body);
        req.end();
      });
    },
  };
}
