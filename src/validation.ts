import { z } from 'zod';
import { isIP } from 'node:net';

const ipv4 = z.string().refine((s) => isIP(s) === 4, { message: 'must be a valid IPv4 address' });
const port = z.coerce.number().int().min(1).max(65535);

// printerUrl is intentionally NOT accepted in the request body.
// The bridge sends it but the relay derives `ipp://${ip}:${port}/ipp/print` itself
// to prevent SSRF: a caller with a valid token could otherwise exfiltrate print
// payloads to an arbitrary URL. zod default behavior strips unknown fields.
export const PrintRequestBodySchema = z.object({
  protocol: z.enum(['tcp', 'ipp']),
  ip: ipv4,
  port,
  data: z.string().min(1),
  encoding: z.enum(['utf-8', 'base64']),
  copies: z.number().int().min(1).max(100),
});

export type PrintRequestBody = z.infer<typeof PrintRequestBodySchema>;

export const StatusQuerySchema = z.object({
  protocol: z.enum(['tcp', 'ipp']),
  port,
});

export type StatusQuery = z.infer<typeof StatusQuerySchema>;
