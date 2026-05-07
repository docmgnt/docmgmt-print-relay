import ipp from 'ipp';
import type { ErrorCode, PrintJob, Transport, TransportResult } from './index';

export interface IppOptions {
  timeoutMs: number;
}

function buildPrinterUrl(job: PrintJob): string {
  return job.printerUrl ?? `ipp://${job.ip}:${job.port}/ipp/print`;
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

export function createIppTransport(opts: IppOptions): Transport {
  return {
    async send(job: PrintJob): Promise<TransportResult> {
      const url = buildPrinterUrl(job);
      const printer = new ipp.Printer(url);

      const message: Record<string, unknown> = {
        'operation-attributes-tag': {
          'requesting-user-name': 'docmgmt-print-relay',
          'job-name': 'docmgmt-job',
          'document-format': 'application/pdf',
        },
        'job-attributes-tag': job.copies > 1 ? { copies: job.copies } : {},
        data: job.data,
      };

      return new Promise<TransportResult>((resolve) => {
        const timer = setTimeout(() => {
          resolve({
            success: false,
            errorCode: 'TIMEOUT',
            error: `ipp request exceeded ${opts.timeoutMs}ms`,
          });
        }, opts.timeoutMs);

        printer.execute(
          'Print-Job',
          message,
          (err: NodeJS.ErrnoException | null, res: { 'status-code'?: string } | undefined) => {
            clearTimeout(timer);
            if (err) {
              resolve({
                success: false,
                errorCode: mapErrorCode(err, undefined),
                error: err.message,
              });
              return;
            }
            const statusCode: string | undefined = res?.['status-code'];
            if (statusCode && statusCode.startsWith('successful-')) {
              resolve({ success: true, bytesWritten: job.data.length });
            } else {
              resolve({
                success: false,
                errorCode: mapErrorCode(null, statusCode),
                error: `ipp status-code: ${statusCode ?? 'unknown'}`,
              });
            }
          },
        );
      });
    },
  };
}
