import { test } from "node:test";
import assert from "node:assert/strict";
import { createSilentLogger } from "../lib/logger.js";
import { Scheduler, type PipelineStep } from "./scheduler.js";

function fakeTimers() {
    const pending = new Map<number, { fn: () => void; ms: number }>();
    let next = 1;
    return {
        setTimeoutFn: (fn: () => void, ms: number) => {
            const id = next++;
            pending.set(id, { fn, ms });
            return id;
        },
        clearTimeoutFn: (handle: unknown) => void pending.delete(handle as number),
        get pendingCount() {
            return pending.size;
        },
        /** Fires the oldest pending timer and returns its delay. */
        fire(): number {
            const [id, timer] = [...pending.entries()][0];
            pending.delete(id);
            timer.fn();
            return timer.ms;
        },
    };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function makeScheduler(steps: PipelineStep[], overrides: { threshold?: number; resetMs?: number; runOnStart?: boolean; now?: () => number } = {}) {
    const timers = fakeTimers();
    let now = 1_000_000;
    const scheduler = new Scheduler({
        steps,
        intervalMs: 60_000,
        runOnStart: overrides.runOnStart ?? true,
        breakerThreshold: overrides.threshold ?? 2,
        breakerResetMs: overrides.resetMs ?? 10_000,
        logger: createSilentLogger(),
        clock: { now: () => new Date(overrides.now?.() ?? now) },
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
    });
    return { scheduler, timers, advance: (ms: number) => void (now += ms) };
}

test("runs steps sequentially in order", async () => {
    const order: string[] = [];
    const { scheduler } = makeScheduler([
        { name: "a", run: async () => void order.push("a") },
        { name: "b", run: async () => void order.push("b") },
    ]);
    await scheduler.runOnce();
    assert.deepEqual(order, ["a", "b"]);
});

test("a failed first step does not skip the second", async () => {
    const order: string[] = [];
    const { scheduler } = makeScheduler([
        {
            name: "sync",
            run: async () => {
                order.push("sync");
                throw new Error("wb down");
            },
        },
        { name: "publish", run: async () => void order.push("publish") },
    ]);
    await scheduler.runOnce();
    assert.deepEqual(order, ["sync", "publish"]);
    const status = scheduler.getStatus();
    assert.equal(status.steps.sync.lastError, "wb down");
    assert.equal(status.steps.sync.consecutiveFailures, 1);
    assert.equal(status.steps.publish.lastError, null);
    assert.ok(status.steps.publish.lastSuccessAt);
});

test("opens the breaker after N failures and skips the step", async () => {
    let syncCalls = 0;
    const { scheduler, advance } = makeScheduler(
        [
            {
                name: "sync",
                run: async () => {
                    syncCalls++;
                    throw new Error("fail");
                },
            },
        ],
        { threshold: 2, resetMs: 10_000 },
    );
    await scheduler.runOnce();
    await scheduler.runOnce();
    assert.equal(scheduler.getStatus().steps.sync.breakerState, "open");
    await scheduler.runOnce();
    assert.equal(syncCalls, 2);

    advance(10_000);
    assert.equal(scheduler.getStatus().steps.sync.breakerState, "half-open");
    await scheduler.runOnce();
    assert.equal(syncCalls, 3);
    assert.equal(scheduler.getStatus().steps.sync.breakerState, "open");
});

test("a successful run closes the breaker again", async () => {
    let fail = true;
    const { scheduler, advance } = makeScheduler(
        [
            {
                name: "sync",
                run: async () => {
                    if (fail) throw new Error("fail");
                },
            },
        ],
        { threshold: 1, resetMs: 5000 },
    );
    await scheduler.runOnce();
    assert.equal(scheduler.getStatus().steps.sync.breakerState, "open");
    fail = false;
    advance(5000);
    await scheduler.runOnce();
    const status = scheduler.getStatus().steps.sync;
    assert.equal(status.breakerState, "closed");
    assert.equal(status.consecutiveFailures, 0);
});

test("one step's breaker does not affect the other", async () => {
    let publishCalls = 0;
    const { scheduler } = makeScheduler(
        [
            {
                name: "sync",
                run: async () => {
                    throw new Error("fail");
                },
            },
            { name: "publish", run: async () => void publishCalls++ },
        ],
        { threshold: 1 },
    );
    await scheduler.runOnce();
    await scheduler.runOnce();
    assert.equal(publishCalls, 2);
    assert.equal(scheduler.getStatus().steps.publish.breakerState, "closed");
});

test("start schedules the first cycle immediately when runOnStart is set, then chains by interval", async () => {
    let runs = 0;
    const { scheduler, timers } = makeScheduler([{ name: "a", run: async () => void runs++ }]);
    scheduler.start();
    assert.equal(timers.pendingCount, 1);
    assert.equal(timers.fire(), 0);
    await flush();
    assert.equal(runs, 1);
    assert.equal(timers.pendingCount, 1);
    assert.equal(timers.fire(), 60_000);
    await flush();
    assert.equal(runs, 2);
    await scheduler.stop();
});

test("start waits a full interval when runOnStart is false", async () => {
    const { scheduler, timers } = makeScheduler([{ name: "a", run: async () => {} }], { runOnStart: false });
    scheduler.start();
    assert.equal(timers.fire(), 60_000);
    await scheduler.stop();
});

test("never schedules the next cycle while one is running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { scheduler, timers } = makeScheduler([{ name: "slow", run: () => gate }]);
    scheduler.start();
    timers.fire();
    await flush();
    assert.equal(timers.pendingCount, 0);
    assert.equal(scheduler.getStatus().cycleInFlight, true);
    release();
    await flush();
    assert.equal(timers.pendingCount, 1);
    await scheduler.stop();
});

test("stop clears the timer and awaits the in-flight cycle", async () => {
    let release!: () => void;
    let finished = false;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { scheduler, timers } = makeScheduler([
        {
            name: "slow",
            run: async () => {
                await gate;
                finished = true;
            },
        },
    ]);
    scheduler.start();
    timers.fire();
    await flush();

    let stopped = false;
    const stopPromise = scheduler.stop().then(() => (stopped = true));
    await flush();
    assert.equal(stopped, false);
    release();
    await stopPromise;
    assert.equal(finished, true);
    assert.equal(timers.pendingCount, 0);
    assert.equal(scheduler.getStatus().running, false);
});

test("stop before the first cycle cancels the pending timer", async () => {
    const { scheduler, timers } = makeScheduler([{ name: "a", run: async () => {} }]);
    scheduler.start();
    await scheduler.stop();
    assert.equal(timers.pendingCount, 0);
});

test("concurrent runOnce calls share the in-flight cycle", async () => {
    let runs = 0;
    const { scheduler } = makeScheduler([{ name: "a", run: async () => void runs++ }]);
    await Promise.all([scheduler.runOnce(), scheduler.runOnce()]);
    assert.equal(runs, 1);
});
