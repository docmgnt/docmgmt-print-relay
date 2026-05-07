import 'dotenv/config';
import { loadConfig, ConfigError } from './config';
import { createLogger } from './logger';
import { buildServer } from './server';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string };

function main(): void {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // eslint-disable-next-line no-console
      console.error(`fatal: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({ level: cfg.logLevel });

  // Capture rare top-level failures through the structured logger so they don't
  // appear as raw stack traces in `docker logs`. Restart will be handled by
  // `restart: unless-stopped` in docker-compose.
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaught-exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ reason: String(reason) }, 'unhandled-rejection');
    process.exit(1);
  });

  const app = buildServer({ ...cfg, version: pkg.version, logger });

  app.listen(cfg.port, () => {
    logger.info(
      { port: cfg.port, version: pkg.version, allowedCidrs: cfg.allowedPrinterCidrs.length },
      'docmgmt-print-relay listening',
    );
  });
}

main();
