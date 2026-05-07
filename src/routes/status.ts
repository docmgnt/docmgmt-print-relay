import { Router } from 'express';
import { Socket } from 'node:net';
import type { Logger } from 'pino';
import { isAllowedPrinterIp } from '../ssrf';
import { StatusQuerySchema } from '../validation';

export interface IppState {
  online: boolean;
  state: 'idle' | 'processing' | 'stopped' | 'unknown';
}

export interface StatusOptions {
  logger: Logger;
  allowedCidrs: string[];
  ippGetState: (args: { ip: string; port: number }) => Promise<IppState>;
}

const TCP_PROBE_TIMEOUT_MS = 2000;

function probeTcp(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let done = false;
    const finish = (online: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(online);
    };
    socket.setTimeout(TCP_PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, ip);
  });
}

export function createStatusRouter(opts: StatusOptions): Router {
  const router = Router();

  router.get('/api/printers/:ip/status', async (req, res) => {
    const ip = req.params.ip;
    const queryParsed = StatusQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({ error: 'invalid query parameters' });
    }
    const { protocol, port } = queryParsed.data;

    if (!isAllowedPrinterIp(ip, opts.allowedCidrs)) {
      return res.status(400).json({ error: 'printer ip not in allowed CIDRs' });
    }

    if (protocol === 'tcp') {
      const open = await probeTcp(ip, port);
      return res.json({ online: open, status: open ? 'ready' : 'offline' });
    }

    try {
      const state = await opts.ippGetState({ ip, port });
      return res.json({ online: state.online, status: state.state });
    } catch (err) {
      opts.logger.warn({ err: (err as Error).message, ip, port }, 'ipp-status-failed');
      return res.json({ online: false, status: 'unknown' });
    }
  });

  return router;
}
