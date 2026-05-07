import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../src/logger';

function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines: () => chunks.join('').split('\n').filter(Boolean) };
}

describe('logger', () => {
  it('emits JSON with the configured level', () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'info' }, stream);
    log.info({ foo: 'bar' }, 'hello');

    const parsed = JSON.parse(lines()[0]!);
    expect(parsed.level).toBe(30); // pino info
    expect(parsed.foo).toBe('bar');
    expect(parsed.msg).toBe('hello');
  });

  it('redacts authorization header', () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'info' }, stream);
    log.info({ headers: { authorization: 'Bearer secret' } }, 'req');

    const parsed = JSON.parse(lines()[0]!);
    expect(parsed.headers.authorization).toBe('[Redacted]');
  });

  it('redacts top-level data field', () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'info' }, stream);
    log.info({ data: 'ZPL bytes here' }, 'print attempt');

    const parsed = JSON.parse(lines()[0]!);
    expect(parsed.data).toBe('[Redacted]');
  });

  it('redacts req.headers.authorization (nested req object)', () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'info' }, stream);
    log.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'r');

    const parsed = JSON.parse(lines()[0]!);
    expect(parsed.req.headers.authorization).toBe('[Redacted]');
  });

  it('respects log level filtering', () => {
    const { stream, lines } = captureStream();
    const log = createLogger({ level: 'warn' }, stream);
    log.info('quiet');
    log.warn('loud');

    expect(lines()).toHaveLength(1);
    expect(JSON.parse(lines()[0]!).msg).toBe('loud');
  });
});
