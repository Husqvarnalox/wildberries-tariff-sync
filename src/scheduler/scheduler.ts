import { CircuitBreaker, type BreakerState } from "../lib/circuit-breaker.js";
import { systemClock, type Clock } from "../lib/clock.js";
import type { Logger } from "../lib/logger.js";

export interface PipelineStep {
    name: string;
    run: () => Promise<unknown>;
}

export interface StepStatus {
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    consecutiveFailures: number;
    breakerState: BreakerState;
}

export interface SchedulerStatus {
    running: boolean;
    cycleInFlight: boolean;
    intervalMs: number;
    nextRunAt: string | null;
    steps: Record<string, StepStatus>;
}

export interface SchedulerOptions {
    steps: PipelineStep[];
    intervalMs: number;
    runOnStart: boolean;
    breakerThreshold: number;
    breakerResetMs: number;
    logger: Logger;
    clock?: Clock;
    setTimeoutFn?: (fn: () => void, ms: number) => unknown;
    clearTimeoutFn?: (handle: unknown) => void;
}

interface StepRuntime {
    step: PipelineStep;
    breaker: CircuitBreaker;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
}

/**
 * Runs the pipeline (steps in order) on a setTimeout chain: the next cycle is only scheduled after the previous one finished, so cycles never overlap. A
 * failing step does not prevent later steps from running.
 */
export class Scheduler {
    private readonly runtimes: StepRuntime[];
    private readonly clock: Clock;
    private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
    private readonly clearTimeoutFn: (handle: unknown) => void;
    private readonly logger: Logger;
    private timer: unknown = null;
    private nextRunAt: Date | null = null;
    private started = false;
    private inFlight: Promise<void> | null = null;

    constructor(private readonly options: SchedulerOptions) {
        this.clock = options.clock ?? systemClock;
        this.logger = options.logger;
        this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
        this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
        this.runtimes = options.steps.map((step) => ({
            step,
            breaker: new CircuitBreaker({ failureThreshold: options.breakerThreshold, resetTimeoutMs: options.breakerResetMs, clock: this.clock }),
            lastRunAt: null,
            lastSuccessAt: null,
            lastError: null,
        }));
    }

    start(): void {
        if (this.started) return;
        this.started = true;
        this.scheduleNext(this.options.runOnStart ? 0 : this.options.intervalMs);
    }

    async stop(): Promise<void> {
        this.started = false;
        if (this.timer !== null) {
            this.clearTimeoutFn(this.timer);
            this.timer = null;
        }
        this.nextRunAt = null;
        if (this.inFlight) await this.inFlight;
    }

    /** Runs one cycle now. If a cycle is already running, waits for it instead of starting another. */
    runOnce(): Promise<void> {
        if (this.inFlight) return this.inFlight;
        const cycle = this.runCycle().finally(() => {
            this.inFlight = null;
        });
        this.inFlight = cycle;
        return cycle;
    }

    getStatus(): SchedulerStatus {
        const steps: Record<string, StepStatus> = {};
        for (const runtime of this.runtimes) {
            steps[runtime.step.name] = {
                lastRunAt: runtime.lastRunAt?.toISOString() ?? null,
                lastSuccessAt: runtime.lastSuccessAt?.toISOString() ?? null,
                lastError: runtime.lastError,
                consecutiveFailures: runtime.breaker.consecutiveFailures,
                breakerState: runtime.breaker.state,
            };
        }
        return {
            running: this.started,
            cycleInFlight: this.inFlight !== null,
            intervalMs: this.options.intervalMs,
            nextRunAt: this.nextRunAt?.toISOString() ?? null,
            steps,
        };
    }

    private scheduleNext(delayMs: number): void {
        if (!this.started) return;
        this.nextRunAt = new Date(this.clock.now().getTime() + delayMs);
        this.timer = this.setTimeoutFn(() => {
            this.timer = null;
            this.nextRunAt = null;
            void this.runOnce().finally(() => this.scheduleNext(this.options.intervalMs));
        }, delayMs);
    }

    private async runCycle(): Promise<void> {
        for (const runtime of this.runtimes) {
            const { step, breaker } = runtime;
            const log = this.logger.child({ step: step.name });
            if (!breaker.canExecute()) {
                log.warn({ consecutiveFailures: breaker.consecutiveFailures }, "Circuit breaker is open, skipping step");
                continue;
            }
            runtime.lastRunAt = this.clock.now();
            try {
                await step.run();
                breaker.recordSuccess();
                runtime.lastSuccessAt = this.clock.now();
                runtime.lastError = null;
            } catch (err) {
                breaker.recordFailure();
                runtime.lastError = err instanceof Error ? err.message : String(err);
                log.error({ err, consecutiveFailures: breaker.consecutiveFailures, breakerState: breaker.state }, "Pipeline step failed");
            }
        }
    }
}
