# 0003. Circuit breaker per pipeline step

## Status

Accepted

## Context

A pipeline cycle has two independent steps: sync tariffs into PostgreSQL, and publish to Google Sheets. They fail for different reasons (Wildberries or database problems versus Google quota, permissions or outages). A single breaker would let one failing dependency halt the healthy one. Repeated calls to a failing external API also waste quota and can trigger rate limits.

## Decision

Each step is guarded by its own `CircuitBreaker`. After `CIRCUIT_BREAKER_THRESHOLD` consecutive failures the breaker opens and the step is skipped until `CIRCUIT_BREAKER_RESET_MS` has elapsed; the next attempt then runs in half-open state, closing on success and re-opening on failure. The breaker is timestamp-based: it stores the time it opened and compares against an injectable clock. It uses no timers. The scheduler exposes breaker state, last error and failure counts via `/status`.

## Consequences

Pros:

- A Google outage does not stop database sync, and a Wildberries outage does not stop republishing existing data.
- No dangling timers; shutdown is clean and tests use a fake clock.
- Failure state is observable without parsing logs.

Cons:

- State is in memory and resets on restart.
- A step that fails permanently (for example a wrong token) is retried once per reset window, so recovery after a fix can take up to the reset period unless the process is restarted.
- Publishing may run on data that is stale while the sync breaker is open.

## Alternatives considered

- **One breaker for the whole cycle**: simpler, but couples unrelated failures.
- **Timer-based reset (`setTimeout` to half-open)**: leaks timers and complicates tests and shutdown.
- **No breaker, rely on retry with backoff only**: backoff handles transient errors inside a cycle, but not sustained outages across cycles.
