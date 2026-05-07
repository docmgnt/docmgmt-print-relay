import { describe, it, expect } from 'vitest';
import { createIppTransport } from '../../src/transports/ipp';

const CUPS_PORT = Number(process.env.CUPS_PORT ?? 10631);
const CUPS_HOST = process.env.CUPS_HOST ?? '127.0.0.1';

// Skipped by default. To enable:
//   1. docker compose -f docker-compose.test.yml up -d
//   2. RUN_INTEGRATION=1 npm run test:integration
//
// v1 ships with unit tests in test/transports/ipp.test.ts that use a real
// local http server speaking IPP via the same `ipp` library round-trip. That
// covers the protocol contract without an external dependency. This file is
// scaffolded for v2 hardening when we want to verify against a real CUPS
// implementation (which exposes printer-state attributes, document-format
// negotiation, and other things our minimal mock skips).
const SHOULD_RUN = process.env.RUN_INTEGRATION === '1';
const desc = SHOULD_RUN ? describe : describe.skip;

desc('ipp transport against cups-pdf', () => {
  it('successfully prints a tiny PDF', async () => {
    const transport = createIppTransport({ timeoutMs: 10_000 });
    const result = await transport.send({
      protocol: 'ipp',
      ip: CUPS_HOST,
      port: CUPS_PORT,
      data: Buffer.from('%PDF-1.4\n%mock\n'),
      copies: 1,
    });

    expect(result.success).toBe(true);
  }, 30_000);
});
