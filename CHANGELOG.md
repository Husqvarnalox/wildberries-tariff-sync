# Changelog

## [0.1.0]

Initial public release.

- Hourly Wildberries box-tariff synchronization with timeout, retries and response validation.
- Idempotent batched upserts into PostgreSQL with Knex migrations.
- Google Sheets publishing to multiple spreadsheets via a service account.
- Per-task circuit breaker and graceful shutdown.
- Docker Compose setup, unit tests and GitHub Actions CI.
