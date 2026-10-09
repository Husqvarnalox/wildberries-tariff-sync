# 0002. Idempotent upsert key

## Status

Accepted

## Context

The sync runs many times per day and must not duplicate rows. History by date is required, so rows from different days must coexist. The Wildberries response lists warehouses with a delivery-and-storage coefficient expression (for example a percentage string). The same warehouse name can appear more than once in one response with different expressions.

## Decision

Table `wb_tariffs` has a unique constraint on `(date, warehouse_name, box_delivery_and_storage_expr)`. Writes use batched multi-row `INSERT ... ON CONFLICT (...) DO UPDATE` inside a single transaction, so a re-run on the same day updates values in place. `date` is the UTC calendar date of the sync.

## Consequences

Pros:

- Re-running a sync is safe; the service can be restarted or triggered at any time.
- Distinct coefficient expressions for one warehouse are preserved instead of silently overwritten.
- Batched statements keep the write cost low and atomic per batch.

Cons:

- If Wildberries changes the expression string for a warehouse during the day, both the old and the new row exist for that date until the next day.
- Because the date is UTC, the "day" boundary may not match Moscow time.
- Keying on a free-form string makes the key sensitive to formatting changes upstream.

## Alternatives considered

- **Key on `(date, warehouse_name)` only**: simpler, but collapses legitimate distinct rows and loses data.
- **Delete-then-insert per date**: avoids a composite key, but is not atomic without a transaction and loses rows if the insert fails midway.
- **Append-only with a surrogate id and "latest wins" views**: full audit trail, but unbounded growth and more complex reads for a dataset where daily granularity is enough.
