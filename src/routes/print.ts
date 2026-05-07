import { Router } from 'express';
import type { Logger } from 'pino';
import { PrintRequestBodySchema } from '../validation';
import { isAllowedPrinterIp } from '../ssrf';
import type { PrintJob, Protocol, Transport } from '../transports';

export interface PrintRouterOptions {
  logger: Logger;
  allowedCidrs: string[];
  getTransport: (protocol: Protocol) => Transport;
}

export function createPrintRouter(opts: PrintRouterOptions): Router {
  const router = Router();

  router.post('/api/print', async (req, res) => {
    const parsed = PrintRequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({
        success: false,
        error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid request body',
      });
    }

    const body = parsed.data;

    if (!isAllowedPrinterIp(body.ip, opts.allowedCidrs)) {
      opts.logger.warn({ ip: body.ip }, 'ssrf-rejection');
      return res.status(400).json({
        success: false,
        error: 'printer ip not in allowed CIDRs',
        errorCode: 'PROTOCOL_ERROR',
      });
    }

    const data =
      body.encoding === 'base64'
        ? Buffer.from(body.data, 'base64')
        : Buffer.from(body.data, 'utf-8');

    const job: PrintJob = {
      protocol: body.protocol,
      ip: body.ip,
      port: body.port,
      data,
      copies: body.copies,
    };

    const start = Date.now();
    const transport = opts.getTransport(body.protocol);
    const result = await transport.send(job);
    const durationMs = Date.now() - start;

    if (result.success) {
      opts.logger.info(
        {
          protocol: job.protocol,
          ip: job.ip,
          port: job.port,
          copies: job.copies,
          durationMs,
          bytesWritten: result.bytesWritten,
        },
        'print-success',
      );
      return res.status(200).json({
        success: true,
        message: 'printed',
        bytesWritten: result.bytesWritten,
      });
    }

    opts.logger.warn(
      {
        protocol: job.protocol,
        ip: job.ip,
        port: job.port,
        copies: job.copies,
        durationMs,
        errorCode: result.errorCode,
        error: result.error,
      },
      'print-failure',
    );
    return res.status(502).json({
      success: false,
      error: result.error,
      errorCode: result.errorCode,
    });
  });

  return router;
}
