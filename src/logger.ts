import pino, { Logger, LoggerOptions } from 'pino';
import type { Writable } from 'node:stream';

export interface LoggerConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

export function createLogger(cfg: LoggerConfig, stream?: Writable): Logger {
  const opts: LoggerOptions = {
    level: cfg.level,
    redact: {
      paths: ['headers.authorization', 'data', 'req.headers.authorization'],
      censor: '[Redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'docmgmt-print-relay' },
  };
  return stream ? pino(opts, stream) : pino(opts);
}

export type { Logger };
