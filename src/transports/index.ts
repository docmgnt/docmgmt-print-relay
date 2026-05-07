export type Protocol = 'tcp' | 'ipp';

export interface PrintJob {
  protocol: Protocol;
  ip: string;
  port: number;
  data: Buffer;
  copies: number;
  printerUrl?: string;
}

export type ErrorCode =
  | 'TIMEOUT'
  | 'REFUSED'
  | 'UNREACHABLE'
  | 'PRINTER_ERROR'
  | 'PROTOCOL_ERROR';

export interface TransportResult {
  success: boolean;
  bytesWritten?: number;
  error?: string;
  errorCode?: ErrorCode;
}

export interface Transport {
  send(job: PrintJob): Promise<TransportResult>;
}

const registry = new Map<Protocol, Transport>();

export function registerTransport(protocol: Protocol, transport: Transport): void {
  registry.set(protocol, transport);
}

export function getTransport(protocol: Protocol): Transport {
  const t = registry.get(protocol);
  if (!t) throw new Error(`no transport registered for protocol "${protocol}"`);
  return t;
}

export function resetTransports(): void {
  registry.clear();
}
