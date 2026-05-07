import { z } from 'zod';
import { isIP } from 'node:net';

const ipv4 = z.string().refine((s) => isIP(s) === 4, { message: 'must be a valid IPv4 address' });
const port = z.coerce.number().int().min(1).max(65535);

// RFC 4648 base64: alphabet [A-Za-z0-9+/] plus optional `=` padding to a multiple of 4.
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function isValidBase64(s: string): boolean {
  return s.length % 4 === 0 && BASE64_RE.test(s);
}

// printerUrl is intentionally NOT accepted in the request body.
// The bridge sends it but the relay derives `ipp://${ip}:${port}/ipp/print` itself
// to prevent SSRF: a caller with a valid token could otherwise exfiltrate print
// payloads to an arbitrary URL. zod default behavior strips unknown fields.
export const PrintRequestBodySchema = z
  .object({
    protocol: z.enum(['tcp', 'ipp']),
    ip: ipv4,
    port,
    data: z.string().min(1),
    encoding: z.enum(['utf-8', 'base64']),
    copies: z.number().int().min(1).max(100),
  })
  .superRefine((body, ctx) => {
    // Validate base64 at the boundary so we never send corrupt bytes to a printer.
    // Buffer.from(s, 'base64') is permissive and silently strips invalid chars,
    // which yields garbage on the wire and an inscrutable printer-side error.
    if (body.encoding === 'base64' && !isValidBase64(body.data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'invalid base64',
      });
    }
  });

export type PrintRequestBody = z.infer<typeof PrintRequestBodySchema>;

export const StatusQuerySchema = z.object({
  protocol: z.enum(['tcp', 'ipp']),
  port,
});

export type StatusQuery = z.infer<typeof StatusQuerySchema>;
