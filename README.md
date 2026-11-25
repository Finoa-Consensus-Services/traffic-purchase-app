# Traffic purchase

Open-source Canton Network app for pricing synchronizer traffic, connecting any [CIP-0103](https://github.com/canton-foundation/cips/blob/main/cip-0103/cip-0103.md) wallet, and purchasing extra traffic for a validator.

Purchases run non-custodially through the user's wallet using the **Token Standard** transfer path (`TransferFactory_Transfer` to `splice_traffic-manager`), with automatic fallback to the legacy `AmuletRules_BuyMemberTraffic` choice when the registry/receiver probe is not available.

## Quick start

Requires **Node.js 20+**.

```bash
cp .env.example .env.local   # set SCAN_BASE_URL
npm install
npm run dev
```

To build and run the production server locally:

```bash
make build   # npm install && npm run build
make run     # builds and starts on PORT (defaults to 3000)
```

## Configuration

Set `SCAN_BASE_URL` in `.env.local` (include `/api/scan`). Public Scan hosts usually use IP allowlisting and require no token.

## Testing

```bash
npm test            # unit and API route tests (tsx --test)
npm run test:e2e    # Playwright E2E suite against mocked wallet & APIs
npm run build       # Next.js production build
npm run gitleaks    # secret scan (requires gitleaks 8.30+ CLI)
```

- `npm install` runs `.githooks/install.sh` to install a pre-commit hook that runs `gitleaks protect --staged`.

## Purchase minimum & quote validity

The buy form enforces a minimum of **200,000 bytes** (or higher if Scan's `minTopupAmount` increases) — `$12.00` at `$60/MB`. Because Token Standard transfers price CC against the active mining round, the app tracks the round tick end (`opensAt + tickDuration`), warns under 60 seconds, pauses buying during the final 10 seconds before a price update, and re-quotes on Review and Confirm.

## Deploy

The [`Dockerfile`](Dockerfile) builds a standalone Next.js production image listening on port `3000` with a health check at `GET /api/health`.

```bash
docker build -t traffic-purchase-app .
docker run --rm -p 3000:3000 --env-file .env.local traffic-purchase-app
```

## Docs

- [docs/test-cases.md](docs/test-cases.md) — unit, API route, and Playwright E2E test catalog
- [docs/threat-model.md](docs/threat-model.md) — threat model and controls

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
