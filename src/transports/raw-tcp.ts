import { Socket } from 'node:net';
import type { ErrorCode, PrintJob, Transport, TransportResult } from './index';

export interface RawTcpOptions {
  connectTimeoutMs: number;
  writeTimeoutMs: number;
}

interface SingleSendResult {
  success: boolean;
  bytesWritten: number;
  errorCode?: ErrorCode;
  error?: string;
}

function sendOnce(
  ip: string,
  port: number,
  data: Buffer,
  opts: RawTcpOptions,
): Promise<SingleSendResult> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let resolved = false;

    function done(result: SingleSendResult) {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(opts.connectTimeoutMs);

    socket.on('timeout', () => {
      done({ success: false, bytesWritten: 0, errorCode: 'TIMEOUT', error: 'tcp timeout' });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      let code: ErrorCode = 'PROTOCOL_ERROR';
      if (err.code === 'ECONNREFUSED') code = 'REFUSED';
      else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') code = 'UNREACHABLE';
      else if (err.code === 'ETIMEDOUT') code = 'TIMEOUT';
      done({ success: false, bytesWritten: 0, errorCode: code, error: err.message });
    });

    socket.connect(port, ip, () => {
      socket.setTimeout(opts.writeTimeoutMs);
      socket.write(data, (err) => {
        if (err) {
          done({
            success: false,
            bytesWritten: 0,
            errorCode: 'PROTOCOL_ERROR',
            error: err.message,
          });
          return;
        }
        socket.end(() => {
          done({ success: true, bytesWritten: data.length });
        });
      });
    });
  });
}

export function createRawTcpTransport(opts: RawTcpOptions): Transport {
  return {
    async send(job: PrintJob): Promise<TransportResult> {
      let totalBytes = 0;
      for (let i = 0; i < job.copies; i++) {
        const result = await sendOnce(job.ip, job.port, job.data, opts);
        if (!result.success) {
          return {
            success: false,
            bytesWritten: totalBytes,
            errorCode: result.errorCode,
            error: result.error,
          };
        }
        totalBytes += result.bytesWritten;
      }
      return { success: true, bytesWritten: totalBytes };
    },
  };
}
