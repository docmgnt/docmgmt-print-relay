# docmgmt-print-relay

On-prem print relay for [docmgmt-ai](https://github.com/docmgnt/docmgmt-ai). Runs on a customer's shop-floor LAN; receives print jobs over a Cloudflare Tunnel and forwards them to thermal (Raw TCP) and laser (IPP) printers.

This is the companion service to docmgmt-ai's `cloudflare_tunnel` print bridge. Without it, the bridge has nothing to talk to.

## What it does

```
docmgmt-ai (Railway, cloud)
  |
  v Cloudflare Tunnel (HTTPS, Bearer auth)
  |
[cloudflared sidecar on shop-floor host]
  |
  v internal Docker network -> http://relay:3010
  |
[docmgmt-print-relay container]
  |
  +-> 192.168.1.50:9100  (Zebra thermal, ZPL/EPL)
  +-> 192.168.1.51:631   (HP laser, IPP/PDF)
```

## Install (5 minutes)

You need:

- A Linux/macOS host on the same LAN as your printers
- Docker + Docker Compose
- A Cloudflare Tunnel set up in the Zero Trust dashboard (with a tunnel token)
- An `API_KEY` shared secret matching what's configured in docmgmt-ai

Steps:

```bash
mkdir docmgmt-print-relay && cd docmgmt-print-relay
curl -O https://raw.githubusercontent.com/docmgnt/docmgmt-print-relay/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/docmgnt/docmgmt-print-relay/main/.env.example
cp .env.example .env

# Edit .env: paste your API_KEY and TUNNEL_TOKEN

docker compose up -d
docker compose logs relay | grep "listening"
```

In the Cloudflare Zero Trust dashboard, configure your tunnel's ingress rule to forward HTTPS traffic to `http://relay:3010` (NOT `localhost:3010` — cloudflared and the relay are separate containers on the internal Docker network).

In docmgmt-ai admin: add a printer with `bridge_type=cloudflare_tunnel`, set `relay_url` to your tunnel's public hostname, set `ip_address` and `port` to the printer's LAN address.

## Configuration

| Var | Required | Default | Purpose |
|---|---|---|---|
| `API_KEY` | yes | — | Bearer token, must match docmgmt-ai admin |
| `TUNNEL_TOKEN` | yes | — | Cloudflare Tunnel token |
| `LOG_LEVEL` | no | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `ALLOWED_PRINTER_CIDRS` | no | RFC1918 + link-local | Comma-separated CIDR allowlist (default: `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16`) |
| `PORT` | no | `3010` | Listen port (inside the container; not published to host) |
| `TCP_CONNECT_TIMEOUT_MS` | no | `5000` | Per-attempt connect timeout for raw_tcp |
| `TCP_WRITE_TIMEOUT_MS` | no | `10000` | Per-attempt write timeout for raw_tcp |
| `IPP_TIMEOUT_MS` | no | `15000` | IPP request timeout |

## Updates

```bash
docker compose pull
docker compose up -d
```

For automatic updates, add [Watchtower](https://containrrr.dev/watchtower/) as a third service in your compose file.

## Security model

The relay's only production defenses are the Cloudflare Tunnel + the `API_KEY` Bearer check. **Never publish the relay's port to the host** (no `ports:` mapping in `docker-compose.yml`). Doing so would expose the relay to the LAN without those protections.

The relay refuses to send to any IP outside `ALLOWED_PRINTER_CIDRS` (default: RFC1918 + link-local). It also rejects `0.0.0.0`, multicast, and broadcast addresses unconditionally. Set the CIDR list as tightly as possible for your network — anything inside the allowed range is treated as trusted.

## Troubleshooting

**Relay starts but jobs fail with `REFUSED`:**

The printer's IP/port is unreachable from the relay container. Verify:
```bash
docker compose exec relay sh
# inside the container:
nc -vz 192.168.1.50 9100
```

**Jobs fail with `printer ip not in allowed CIDRs`:**

The printer is on a network range outside `ALLOWED_PRINTER_CIDRS`. Add the range to `.env`:
```
ALLOWED_PRINTER_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,172.99.0.0/16
```
Then `docker compose up -d` to restart.

**`401 unauthorized`:**

The `API_KEY` in `.env` doesn't match what docmgmt-ai is sending. Regenerate in the admin console and update both sides.

**Cloudflared can't reach the relay:**

Verify both services are on the `internal` network:
```bash
docker compose ps
docker network inspect $(basename $(pwd))_internal
```
And check the tunnel's ingress rule in the Cloudflare dashboard points at `http://relay:3010`.

**`PROTOCOL_ERROR` on every job:**

Usually means the relay reached the printer but the printer rejected the payload (wrong format, IPP version mismatch). Check the printer's web admin for queued jobs and recent errors.

## Architecture

See the [design spec](https://github.com/docmgnt/docmgmt-ai/blob/main/docs/superpowers/specs/2026-05-07-print-relay-design.md) and [implementation plan](https://github.com/docmgnt/docmgmt-ai/blob/main/docs/superpowers/plans/2026-05-07-print-relay-implementation.md) in docmgmt-ai for the full design rationale.

Quick summary:

- **Stateless.** No DB, no on-disk persistence. The bridge in docmgmt-ai is the source of truth for the print-job ledger.
- **Single attempt per request.** No retries inside the relay; the bridge owns retry policy.
- **Typed `errorCode`.** Failed prints return `{ success: false, error, errorCode }` where `errorCode` is one of `TIMEOUT`, `REFUSED`, `UNREACHABLE`, `PRINTER_ERROR`, `PROTOCOL_ERROR`. Bridge persists this for retry/alert decisions.
- **SSRF allowlist.** Every outbound socket goes through `isAllowedPrinterIp` first; CIDR list is validated at startup, not at request time.
- **Raw TCP for thermal, IPP for laser.** TCP path uses `net.Socket` with per-attempt connect/write timeouts. IPP path uses `http.request` directly (not `ipp.Printer.execute`) so we hold the request reference and can `req.destroy()` on timeout to avoid FD leaks against hung printers.

## Development

```bash
git clone https://github.com/docmgnt/docmgmt-print-relay
cd docmgmt-print-relay
nvm use
npm install
npm test
```

Local dev server (auto-restart on file change):
```bash
API_KEY=dev npm run dev
```

Build the Docker image locally:
```bash
docker build -t docmgmt-print-relay:dev .
```

## License

MIT
