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
  const app = buildServer({ ...cfg, version: pkg.version, logger });

  app.listen(cfg.port, () => {
    logger.info(
      { port: cfg.port, version: pkg.version, allowedCidrs: cfg.allowedPrinterCidrs.length },
      'docmgmt-print-relay listening',
    );
  });
}

main();
