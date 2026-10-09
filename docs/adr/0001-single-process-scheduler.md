# 0001. Single-process in-app scheduler

## Status

Accepted

## Context

The service must run a pipeline (sync tariffs, then publish to Sheets) on a fixed cadence, roughly hourly. Wildberries tariffs change at most daily, the workload is a few HTTP calls and one batched write, and the deployment target is a single Docker Compose stack. Overlapping cycles would waste API quota and race on the sheet rewrite.

## Decision

Run the scheduler inside the application process as a `setTimeout` chain: the next cycle is scheduled only after the previous one finishes, so cycles never overlap. `stop()` clears the timer and awaits the in-flight cycle for graceful shutdown. Timer functions are injectable so tests run without real time.

## Consequences

Pros:

- No extra infrastructure (no Redis, no cluster, no external cron).
- Non-overlap is structural, not enforced by locks.
- Easy to test with fake timers and a fake clock.
- Cycle state is available in-process for the `/status` endpoint.

Cons:

- Exactly one replica must run. Several replicas would publish redundantly (data stays consistent thanks to the idempotent upsert, see ADR 0002).
- The cadence is an interval, not a wall-clock schedule; drift is accepted.
- A crashed process misses cycles until restarted (mitigated by the container restart policy).

## Alternatives considered

- **System cron or Kubernetes CronJob**: precise scheduling, but needs a separate entrypoint, cold starts on every run, and external orchestration that the target deployment does not have.
- **BullMQ or another queue**: gives retries, leader safety and horizontal scale, at the cost of Redis and considerable operational weight for one hourly job.
- **`setInterval`**: simple, but overlapping cycles are possible when a run exceeds the interval. This was the 0.1.0 behavior.
