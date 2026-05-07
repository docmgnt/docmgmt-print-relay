import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, ConfigError } from '../src/config';

describe('loadConfig', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('throws ConfigError when API_KEY is missing', () => {
    delete process.env.API_KEY;
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it('parses required fields with defaults applied', () => {
    process.env.API_KEY = 'test-key';
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.ALLOWED_PRINTER_CIDRS;

    const cfg = loadConfig();
    expect(cfg.apiKey).toBe('test-key');
    expect(cfg.port).toBe(3010);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.allowedPrinterCidrs).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '169.254.0.0/16',
    ]);
    expect(cfg.tcpConnectTimeoutMs).toBe(5000);
    expect(cfg.tcpWriteTimeoutMs).toBe(10000);
    expect(cfg.ippTimeoutMs).toBe(15000);
  });

  it('parses ALLOWED_PRINTER_CIDRS as comma-separated', () => {
    process.env.API_KEY = 'k';
    process.env.ALLOWED_PRINTER_CIDRS = '10.1.0.0/16, 192.168.42.0/24';
    const cfg = loadConfig();
    expect(cfg.allowedPrinterCidrs).toEqual(['10.1.0.0/16', '192.168.42.0/24']);
  });

  it('rejects PORT outside 1-65535', () => {
    process.env.API_KEY = 'k';
    process.env.PORT = '70000';
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it('rejects unknown LOG_LEVEL', () => {
    process.env.API_KEY = 'k';
    process.env.LOG_LEVEL = 'shouty';
    expect(() => loadConfig()).toThrow(ConfigError);
  });
});
