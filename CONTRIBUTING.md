# Contributing

## Setup

Requires Node.js 20+ and Docker (for PostgreSQL).

```bash
npm ci
cp example.env .env
docker compose up -d postgres   # set POSTGRES_HOST=localhost in .env for local runs
```

## Checks

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

## Pull requests

- Keep changes focused; describe the behavior change and how you tested it.
- Add or update unit tests for parsing and normalization logic.
- Never commit `.env`, tokens or Google credentials.
