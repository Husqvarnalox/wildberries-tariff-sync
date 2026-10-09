import { systemClock, type Clock } from "./clock.js";

export type BreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeoutMs: number;
    clock?: Clock;
}

/** Timestamp-based circuit breaker: no timers, state is derived from the clock on demand. */
export class CircuitBreaker {
    private readonly failureThreshold: number;
    private readonly resetTimeoutMs: number;
    private readonly clock: Clock;
    private failures = 0;
    private openedAt: number | null = null;
    private probeInFlight = false;

    constructor(options: CircuitBreakerOptions) {
        this.failureThreshold = options.failureThreshold;
        this.resetTimeoutMs = options.resetTimeoutMs;
        this.clock = options.clock ?? systemClock;
    }

    get consecutiveFailures(): number {
        return this.failures;
    }

    get state(): BreakerState {
        if (this.openedAt === null) return "closed";
        return this.clock.now().getTime() - this.openedAt >= this.resetTimeoutMs ? "half-open" : "open";
    }

    /** In half-open state exactly one attempt is let through until its outcome is recorded. */
    canExecute(): boolean {
        const state = this.state;
        if (state === "closed") return true;
        if (state === "open") return false;
        if (this.probeInFlight) return false;
        this.probeInFlight = true;
        return true;
    }

    recordSuccess(): void {
        this.failures = 0;
        this.openedAt = null;
        this.probeInFlight = false;
    }

    recordFailure(): void {
        this.failures += 1;
        const wasProbe = this.probeInFlight;
        this.probeInFlight = false;
        if (wasProbe || this.failures >= this.failureThreshold) {
            this.openedAt = this.clock.now().getTime();
        }
    }
}
