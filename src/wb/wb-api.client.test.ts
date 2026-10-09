import { test } from "node:test";
import assert from "node:assert/strict";
import { createSilentLogger } from "../lib/logger.js";
import { WbApiClient, WbApiError } from "./wb-api.client.js";

const validBody = {
    response: { data: { dtNextBox: "2025-03-02", dtTillMax: "2025-03-30", warehouseList: [{ warehouseName: "Коледино", boxDeliveryBase: "48" }] } },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function makeClient(fetchImpl: typeof fetch, overrides: { timeoutMs?: number; attempts?: number } = {}) {
    const sleeps: number[] = [];
    const client = new WbApiClient({
        baseUrl: "https://wb.example",
        token: "secret-token",
        timeoutMs: overrides.timeoutMs ?? 1000,
        retry: { attempts: overrides.attempts ?? 3 },
        logger: createSilentLogger(),
        fetchImpl,
        sleep: async (ms) => void sleeps.push(ms),
        random: () => 0.5,
    });
    return { client, sleeps };
}

test("returns the parsed response and sends the date and Authorization header", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
        calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
        return json(validBody);
    }) as typeof fetch;
    const { client } = makeClient(fetchImpl);
    const result = await client.fetchBoxTariffs("2025-03-01");
    assert.equal(result.response.data.warehouseList[0].warehouseName, "Коледино");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://wb.example/api/v1/tariffs/box?date=2025-03-01");
    assert.equal(calls[0].auth, "secret-token");
});

test("retries a 500 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => (++calls === 1 ? json({}, 500) : json(validBody))) as typeof fetch;
    const { client, sleeps } = makeClient(fetchImpl);
    await client.fetchBoxTariffs("2025-03-01");
    assert.equal(calls, 2);
    assert.equal(sleeps.length, 1);
});

test("retries 429 and network errors", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
        calls++;
        if (calls === 1) return json({}, 429);
        if (calls === 2) throw new TypeError("fetch failed");
        return json(validBody);
    }) as typeof fetch;
    const { client } = makeClient(fetchImpl);
    await client.fetchBoxTariffs("2025-03-01");
    assert.equal(calls, 3);
});

test("gives up after the configured attempts with a retryable error", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, json({}, 503))) as typeof fetch;
    const { client } = makeClient(fetchImpl, { attempts: 3 });
    await assert.rejects(client.fetchBoxTariffs("2025-03-01"), (err: unknown) => {
        assert.ok(err instanceof WbApiError);
        assert.equal(err.status, 503);
        assert.equal(err.retryable, true);
        return true;
    });
    assert.equal(calls, 3);
});

test("does not retry a 401", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, json({}, 401))) as typeof fetch;
    const { client } = makeClient(fetchImpl);
    await assert.rejects(client.fetchBoxTariffs("2025-03-01"), (err: unknown) => {
        assert.ok(err instanceof WbApiError);
        assert.equal(err.status, 401);
        assert.equal(err.retryable, false);
        return true;
    });
    assert.equal(calls, 1);
});

test("an invalid body fails schema validation without retrying", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, json({ response: { data: {} } }))) as typeof fetch;
    const { client } = makeClient(fetchImpl);
    await assert.rejects(client.fetchBoxTariffs("2025-03-01"), (err: unknown) => {
        assert.ok(err instanceof WbApiError);
        assert.equal(err.retryable, false);
        assert.match(err.message, /schema validation/);
        assert.match(err.message, /warehouseList/);
        return true;
    });
    assert.equal(calls, 1);
});

test("a non-JSON body is a non-retryable error", async () => {
    const fetchImpl = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    const { client } = makeClient(fetchImpl);
    await assert.rejects(client.fetchBoxTariffs("2025-03-01"), /non-JSON/);
});

test("aborts a hanging request after the timeout and reports it as retryable", async () => {
    let calls = 0;
    const fetchImpl = ((_input: URL | string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
            calls++;
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })) as typeof fetch;
    const { client } = makeClient(fetchImpl, { timeoutMs: 20, attempts: 2 });
    await assert.rejects(client.fetchBoxTariffs("2025-03-01"), (err: unknown) => {
        assert.ok(err instanceof WbApiError);
        assert.equal(err.retryable, true);
        assert.match(err.message, /timed out/);
        return true;
    });
    assert.equal(calls, 2);
});
