# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-10

### Added

- Modular source layout (`config`, `lib`, `wb`, `tariffs`, `sheets`, `scheduler`, `http`, `postgres`, `cli`).
- Dependency injection through interfaces (`TariffsSource`, `TariffRepository`, `Clock`) for testable services.
- Zod-validated Wildberries response schema and configuration.
- Structured JSON logging with pino and a `module` field.
- Exponential backoff with full jitter for Wildberries requests.
- Timestamp-based circuit breaker, one per pipeline step.
- Sequential pipeline scheduler built on a `setTimeout` chain with graceful shutdown.
- HTTP endpoints `/healthz`, `/readyz` and `/status`.
- Batched multi-row upserts inside a transaction.
- `SHEETS_PUBLISH_SCOPE` (`latest` or `all`) and `SHEETS_SHEET_NAME`.
- Configurable `SYNC_INTERVAL_MS`, `RUN_ON_START`, `CIRCUIT_BREAKER_*`, `WB_*` and `LOG_LEVEL` settings.
- ESLint 9 flat config and `.editorconfig`.
- Integration tests against PostgreSQL, gated by `TEST_DATABASE_URL`.
- CI jobs for lint, unit, integration and Docker build.
- GHCR release workflow, Dependabot, issue and pull request templates, CODEOWNERS.
- Architecture decision records and an operations runbook.

### Changed

- `example.env` renamed to `.env.example`.
- Docker base image updated to Node 22.
- Container runs as a non-root numeric user.
- Sheet values are written as numbers instead of strings.

### Removed

- Console logging.
- `setInterval` scheduling.

## [0.1.0]

Initial public release.

- Hourly Wildberries box-tariff synchronization with timeout, retries and response validation.
- Idempotent batched upserts into PostgreSQL with Knex migrations.
- Google Sheets publishing to multiple spreadsheets via a service account.
- Per-task circuit breaker and graceful shutdown.
- Docker Compose setup, unit tests and GitHub Actions CI.

[Unreleased]: https://github.com/Husqvarnalox/wildberries-tariff-sync/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Husqvarnalox/wildberries-tariff-sync/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Husqvarnalox/wildberries-tariff-sync/releases/tag/v0.1.0
