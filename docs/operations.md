# Operations runbook

## Startup sequence

1. Load and validate configuration (the process exits with a message listing invalid variables).
2. Create the logger and the Knex connection.
3. Run pending migrations.
4. Build services, the scheduler and the health server.
5. Start the health server on `APP_PORT`.
6. Start the scheduler. With `RUN_ON_START=true` the first cycle runs immediately; otherwise after `SYNC_INTERVAL_MS`.

On `SIGTERM` or `SIGINT` the scheduler stops accepting new cycles, waits for the in-flight cycle, closes the HTTP server and the database pool, then exits.

## Health endpoints

| Endpoint | Meaning |
| --- | --- |
| `GET /healthz` | Liveness. `200` while the process is serving requests. |
| `GET /readyz` | Readiness. `200` if `select 1` against PostgreSQL succeeds; `503` if the database is unreachable. |
| `GET /status` | Scheduler state (`running`, `cycleInFlight`, `nextRunAt`) and per step under `steps.tariffs_sync` / `steps.sheets_publish`: `lastRunAt`, `lastSuccessAt`, `lastError`, `consecutiveFailures`, `breakerState`. |

A `503` from `/readyz` means the database check failed. The process keeps running; the scheduler records failures and retries on the next cycle.

## Reading logs

Logs are JSON, one object per line, with a `module` field.

```bash
docker compose logs app --no-log-prefix | jq -c 'select(.level >= 40)'
docker compose logs app --no-log-prefix | jq -c 'select(.module == "wb-api")'
```

Pino levels: 30 info, 40 warn, 50 error. Increase detail with `LOG_LEVEL=debug`.

## Common failures

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Wildberries `401` | Token invalid, expired or missing the required scope | Issue a new token with access to the common/tariffs API and update `WBTOKEN`. 4xx responses are not retried. |
| Wildberries `429` or `5xx` | Rate limit or upstream outage | Retried with exponential backoff and jitter; no action unless the breaker opens. |
| Sheets `403` | Spreadsheet not shared with the service account | Share the sheet with the `client_email` from the credentials file as an editor. |
| Sheets `404` | Wrong spreadsheet ID | Check `SPREADSHEET_IDS` and the `spreadsheets` table. |
| `/readyz` returns `503` | PostgreSQL unreachable | Check `docker compose ps postgres`, credentials and `POSTGRES_HOST`. |
| A step is skipped, `breakerState` is `open` | Threshold of consecutive failures reached | Read `lastError` in `/status`, fix the cause. The step retries after `CIRCUIT_BREAKER_RESET_MS`; restart the service to retry immediately. |

## Migrations

Migrations run automatically on startup. To run them manually inside the container:

```bash
docker compose exec app npm run knex -- migrate list
docker compose exec app npm run knex -- migrate latest
docker compose exec app npm run knex -- migrate rollback
```

Roll back before downgrading to an image that predates a migration. Take a backup first.

## Backup

```bash
docker compose exec postgres pg_dump -U postgres -d postgres -Fc > wb_tariffs.dump
docker compose exec -T postgres pg_restore -U postgres -d postgres --clean < wb_tariffs.dump
```

Use the values of `POSTGRES_USER` and `POSTGRES_DB` if they differ from the defaults.

## Upgrading

```bash
# set the new tag in compose.yaml or pull the latest
docker compose pull app
docker compose up -d app
```

Check `docker compose logs app` for the migration step and `GET /readyz` afterwards. Pin an explicit version tag in production instead of `latest`.

## Rotating credentials

- Wildberries token: update `WBTOKEN` in `.env`, then `docker compose up -d app`.
- Google credentials: replace the mounted JSON file and restart the service. Revoke the old key in Google Cloud.
- Database password: change it in PostgreSQL and in `.env`, then recreate both containers.

## Scaling

Run exactly one replica. There is no leader election; multiple replicas publish redundantly and race on the sheet rewrite (see [ADR 0001](adr/0001-single-process-scheduler.md)). The database upsert stays consistent either way.
