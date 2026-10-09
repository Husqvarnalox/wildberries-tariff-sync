import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBackoff, withRetry } from "./retry.js";

const base = { baseDelayMs: 100, maxDelayMs: 1000, random: () => 0.999 };

test("returns the first successful result without sleeping", async () => {
    const sleeps: number[] = [];
    const result = await withRetry(async () => "ok", { ...base, attempts: 3, sleep: async (ms) => void sleeps.push(ms) });
    assert.equal(result, "ok");
    assert.deepEqual(sleeps, []);
});

test("retries until success", async () => {
    let calls = 0;
    const result = await withRetry(
        async () => {
            if (++calls < 3) throw new Error("boom");
            return calls;
        },
        { ...base, attempts: 5, sleep: async () => {} },
    );
    assert.equal(result, 3);
});

test("honors the attempts limit and rethrows the last error", async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => {
                throw new Error(`fail ${++calls}`);
            },
            { ...base, attempts: 3, sleep: async () => {} },
        ),
        /fail 3/,
    );
    assert.equal(calls, 3);
});

test("does not retry when shouldRetry returns false", async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => {
                calls++;
                throw new Error("fatal");
            },
            { ...base, attempts: 5, shouldRetry: () => false, sleep: async () => {} },
        ),
        /fatal/,
    );
    assert.equal(calls, 1);
});

test("backoff grows exponentially and is capped by maxDelayMs", async () => {
    const sleeps: number[] = [];
    await assert.rejects(
        withRetry(
            async () => {
                throw new Error("x");
            },
            { attempts: 6, baseDelayMs: 100, maxDelayMs: 500, random: () => 0.9999, sleep: async (ms) => void sleeps.push(ms) },
        ),
    );
    assert.equal(sleeps.length, 5);
    assert.deepEqual(
        sleeps.map((ms) => ms <= 500),
        [true, true, true, true, true],
    );
    assert.ok(sleeps[1] > sleeps[0]);
    assert.ok(sleeps[4] >= 400);
});

test("full jitter stays within [0, ceiling)", () => {
    assert.equal(
        computeBackoff(1, 100, 1000, () => 0),
        0,
    );
    assert.equal(
        computeBackoff(3, 100, 1000, () => 0.5),
        200,
    );
    for (let i = 0; i < 50; i++) {
        const delay = computeBackoff(10, 100, 1000);
        assert.ok(delay >= 0 && delay < 1000);
    }
});

test("onRetry receives attempt, delay and error", async () => {
    const seen: { attempt: number; delayMs: number }[] = [];
    let calls = 0;
    await withRetry(
        async () => {
            if (++calls < 2) throw new Error("once");
        },
        { ...base, attempts: 3, sleep: async () => {}, onRetry: ({ attempt, delayMs }) => seen.push({ attempt, delayMs }) },
    );
    assert.deepEqual(seen, [{ attempt: 1, delayMs: 99 }]);
});
