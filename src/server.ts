import express, { Express } from 'express';
import helmet from 'helmet';
import { createLogger, Logger } from './logger';
import { createAuthMiddleware } from './auth';
import { createHealthRouter } from './routes/health';
import { createDiscoverRouter } from './routes/discover';
import { createPrintRouter, PRINT_BODY_SIZE_LIMIT } from './routes/print';
import { createStatusRouter } from './routes/status';
import { createRawTcpTransport } from './transports/raw-tcp';
import { createIppTransport } from './transports/ipp';
import {
  registerTransport,
  resetTransports,
  getTransport,
  Transport,
  Protocol,
} from './transports';
import { getIppState } from './transports/ipp-state';

export interface ServerConfig {
  apiKey: string;
  port: number;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  allowedPrinterCidrs: string[];
  tcpConnectTimeoutMs: number;
  tcpWriteTimeoutMs: number;
  ippTimeoutMs: number;
  version: string;
  transportOverrides?: Partial<Record<Protocol, Transport>>;
  logger?: Logger;
}

export function buildServer(cfg: ServerConfig): Express {
  const logger =
    cfg.logger ??
    (cfg.logLevel === 'silent'
      ? createLogger({ level: 'fatal' })
      : createLogger({ level: cfg.logLevel }));

  resetTransports();
  registerTransport(
    'tcp',
    cfg.transportOverrides?.tcp ??
      createRawTcpTransport({
        connectTimeoutMs: cfg.tcpConnectTimeoutMs,
        writeTimeoutMs: cfg.tcpWriteTimeoutMs,
      }),
  );
  registerTransport(
    'ipp',
    cfg.transportOverrides?.ipp ?? createIppTransport({ timeoutMs: cfg.ippTimeoutMs }),
  );

  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: PRINT_BODY_SIZE_LIMIT }));

  // Health is registered BEFORE auth so it bypasses authentication.
  app.use(createHealthRouter({ version: cfg.version }));
  app.use(createAuthMiddleware(cfg.apiKey, logger));
  app.use(createDiscoverRouter({ logger }));
  app.use(
    createPrintRouter({
      logger,
      allowedCidrs: cfg.allowedPrinterCidrs,
      getTransport,
    }),
  );
  app.use(
    createStatusRouter({
      logger,
      allowedCidrs: cfg.allowedPrinterCidrs,
      ippGetState: (args) => getIppState({ ...args, timeoutMs: cfg.ippTimeoutMs }),
    }),
  );

  // Catch-all error handler — honors express conventions (err.status/err.statusCode
  // for known errors like PayloadTooLargeError=413), falls back to 500 for genuine
  // exceptions. Returns a generic body; never leaks stack content.
  // errorCode is reserved for printer-protocol failures (the Transport taxonomy);
  // we don't emit it on caller-side 4xx errors to avoid misleading the bridge's
  // retry logic.
  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ): void => {
      const status = err.status ?? err.statusCode ?? 500;
      if (status >= 500) {
        logger.error({ err: err.message, stack: err.stack }, 'unhandled-error');
      } else {
        logger.warn({ err: err.message, status }, 'request-error');
      }
      const body: Record<string, unknown> = {
        success: false,
        error: status === 413 ? 'payload too large' : status === 400 ? 'bad request' : 'internal error',
      };
      if (status >= 500) body.errorCode = 'PROTOCOL_ERROR';
      res.status(status).json(body);
    },
  );

  return app;
}
