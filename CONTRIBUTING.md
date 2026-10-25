# Contributing

## Setup

Requires Node.js 22 (see `.nvmrc`) and Docker.

```bash
nvm use
npm ci
cp .env.example .env
docker compose up -d postgres   # set POSTGRES_HOST=localhost in .env for local runs
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run with `tsx` watch and pretty logs |
| `npm run typecheck` | TypeScript check without emit |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (needs `TEST_DATABASE_URL`) |
| `npm run check` | Typecheck, lint, format check and unit tests |
| `npm run build` | Compile to `dist/` |

## Test tiers

- **Unit** (`*.test.ts`): pure modules, with fakes for `fetch`, the Sheets client, the clock and timers. No network, no database.
- **Integration** (`*.integration.test.ts`): repository against a real PostgreSQL, skipped unless `TEST_DATABASE_URL` is set, for example `postgres://postgres:postgres@localhost:5432/postgres`.

CI never calls the live Wildberries or Google APIs.

## Editor and checkout safety

- Do not commit `.vscode/` (it is git-ignored). This repository never ships `.vscode/tasks.json`; a pull request adding one, or any file under `public/fonts/`, must be rejected unless the owner explicitly asked for it.
- Keep the VS Code user setting `"task.allowAutomaticTasks": "off"` so a malicious checkout cannot run a task on folder open.
- The `a10-guard` check must stay green; see SECURITY.md for what it enforces. Do not add npm lifecycle scripts (`postinstall` and friends) that run local files or download anything.

## Commits and branches

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`. Example: `fix(wb): do not retry on 400`.

Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.

## Pull requests

- Keep changes focused and describe the behavior change and how it was tested.
- `npm run check` must pass; run `npm run test:integration` when touching the repository or migrations.
- Add or update tests and docs, and add a CHANGELOG entry under `[Unreleased]`.
- Never commit `.env`, tokens or Google credentials.

## Architecture decisions

For a significant design change, propose a new record in `docs/adr/` (copy the structure of an existing one, status `Proposed`) in the same pull request. Supersede old records instead of rewriting them.

## Releasing

1. Bump `version` in `package.json`.
2. Move `[Unreleased]` entries in `CHANGELOG.md` under a new version heading and update the link references.
3. Merge to `main`, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The release workflow builds multi-arch images, pushes them to `ghcr.io/husqvarnalox/wildberries-tariff-sync` and creates the GitHub release.
