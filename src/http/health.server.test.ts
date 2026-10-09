import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createSilentLogger } from "../lib/logger.js";
import { startHealthServer, type HealthServer } from "./health.server.js";

let ready = true;
let server: HealthServer;
let base: string;

before(async () => {
    server = await startHealthServer({
        port: 0,
        host: "127.0.0.1",
        readinessCheck: async () => {
            if (!ready) throw new Error("db down");
        },
        statusProvider: () => ({ steps: { tariffs_sync: { breakerState: "closed" } } }),
        logger: createSilentLogger(),
        readinessTimeoutMs: 50,
    });
    base = `http://127.0.0.1:${server.port}`;
});

after(async () => {
    await server.close();
});

test("GET /healthz returns 200 ok", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { status: "ok" });
});

test("GET /readyz returns 200 when the check passes and 503 when it fails", async () => {
    ready = true;
    assert.equal((await fetch(`${base}/readyz`)).status, 200);
    ready = false;
    const res = await fetch(`${base}/readyz`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "unavailable" });
    ready = true;
});

test("GET /readyz returns 503 when the check hangs past the timeout", async () => {
    const slow = await startHealthServer({
        port: 0,
        host: "127.0.0.1",
        readinessCheck: () => new Promise(() => {}),
        statusProvider: () => ({}),
        logger: createSilentLogger(),
        readinessTimeoutMs: 30,
    });
    try {
        assert.equal((await fetch(`http://127.0.0.1:${slow.port}/readyz`)).status, 503);
    } finally {
        await slow.close();
    }
});

test("GET /status returns the scheduler status", async () => {
    const res = await fetch(`${base}/status`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { steps: { tariffs_sync: { breakerState: "closed" } } });
});

test("unknown paths and methods return 404", async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`, { method: "POST" })).status, 404);
});
