import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker } from "./circuit-breaker.js";

function setup(threshold = 3, resetMs = 1000) {
    let now = 1_000_000;
    const clock = { now: () => new Date(now) };
    const breaker = new CircuitBreaker({ failureThreshold: threshold, resetTimeoutMs: resetMs, clock });
    return { breaker, advance: (ms: number) => void (now += ms) };
}

test("starts closed and allows execution", () => {
    const { breaker } = setup();
    assert.equal(breaker.state, "closed");
    assert.equal(breaker.canExecute(), true);
});

test("stays closed below the threshold and success resets the counter", () => {
    const { breaker } = setup();
    breaker.recordFailure();
    breaker.recordFailure();
    assert.equal(breaker.state, "closed");
    assert.equal(breaker.consecutiveFailures, 2);
    breaker.recordSuccess();
    assert.equal(breaker.consecutiveFailures, 0);
});

test("opens after the failure threshold and blocks execution", () => {
    const { breaker } = setup();
    for (let i = 0; i < 3; i++) breaker.recordFailure();
    assert.equal(breaker.state, "open");
    assert.equal(breaker.canExecute(), false);
});

test("becomes half-open after the reset timeout and lets exactly one attempt through", () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i++) breaker.recordFailure();
    advance(999);
    assert.equal(breaker.state, "open");
    advance(1);
    assert.equal(breaker.state, "half-open");
    assert.equal(breaker.canExecute(), true);
    assert.equal(breaker.canExecute(), false);
});

test("closes again when the half-open probe succeeds", () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i++) breaker.recordFailure();
    advance(1000);
    assert.equal(breaker.canExecute(), true);
    breaker.recordSuccess();
    assert.equal(breaker.state, "closed");
    assert.equal(breaker.consecutiveFailures, 0);
    assert.equal(breaker.canExecute(), true);
});

test("re-opens for a full reset period when the half-open probe fails", () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i++) breaker.recordFailure();
    advance(1000);
    assert.equal(breaker.canExecute(), true);
    breaker.recordFailure();
    assert.equal(breaker.state, "open");
    advance(999);
    assert.equal(breaker.canExecute(), false);
    advance(1);
    assert.equal(breaker.canExecute(), true);
});
