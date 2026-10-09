# 0004. Google Sheets publish scope

## Status

Accepted

## Context

PostgreSQL stores tariff history by date, growing by one set of warehouse rows per day. The Sheets publisher clears and rewrites the whole `stocks_coefs` sheet each cycle. Google Sheets has cell limits per spreadsheet, and every write is sent over the API, so the volume written per cycle matters. The typical consumer of the sheet wants the current coefficients, sorted by coefficient ascending.

## Decision

`SHEETS_PUBLISH_SCOPE` selects what is published. The default `latest` publishes only the rows of the most recent date in the database. `all` publishes the full history and is opt-in. In both modes the sheet is rewritten completely, values are written as numbers, and rows are sorted by coefficient ascending.

## Consequences

Pros:

- Sheet size and write cost stay bounded by default regardless of how long the service runs.
- Full history remains available in PostgreSQL and, if wanted, in the sheet via `all`.
- A single switch with two values is easy to document and test.

Cons:

- With `all`, the sheet eventually reaches Google's cell limit; operators must choose it knowingly.
- Users who want a date range need a future scope value (for example the last N days).
- Full rewrite means a brief window where the sheet is empty during a publish.

## Alternatives considered

- **Always publish full history**: simple, but unbounded growth breaks the sheet over time.
- **Incremental append**: cheaper writes, but needs tracking of what was already published and handles upstream corrections poorly.
- **Separate sheet per date**: preserves history in Sheets, but produces many tabs and complicates consumers.
