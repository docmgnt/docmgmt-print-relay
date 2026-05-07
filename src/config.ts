import { z } from 'zod';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'API_KEY is required'),
  port: z.coerce.number().int().min(1).max(65535).default(3010),
  logLevel: z.enum(LOG_LEVELS).default('info'),
  allowedPrinterCidrs: z
    .string()
    .default('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16')
    .transform((s) => s.split(',').map((c) => c.trim()).filter(Boolean)),
  tcpConnectTimeoutMs: z.coerce.number().int().positive().default(5000),
  tcpWriteTimeoutMs: z.coerce.number().int().positive().default(10000),
  ippTimeoutMs: z.coerce.number().int().positive().default(15000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = {
    apiKey: env.API_KEY,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    allowedPrinterCidrs: env.ALLOWED_PRINTER_CIDRS,
    tcpConnectTimeoutMs: env.TCP_CONNECT_TIMEOUT_MS,
    tcpWriteTimeoutMs: env.TCP_WRITE_TIMEOUT_MS,
    ippTimeoutMs: env.IPP_TIMEOUT_MS,
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`invalid config: ${issues}`);
  }
  return result.data;
}
