import { test } from "node:test";
import assert from "node:assert/strict";
import type { sheets_v4 } from "googleapis";
import { createSilentLogger } from "../lib/logger.js";
import type { TariffRow } from "../tariffs/tariff.model.js";
import type { TariffRepository } from "../tariffs/tariff.repository.js";
import { GoogleSheetsPublisher, SHEET_HEADERS } from "./google-sheets.publisher.js";

const row = (overrides: Partial<TariffRow> = {}): TariffRow => ({
    date: "2025-03-01",
    warehouse_name: "A",
    box_delivery_and_storage_expr: "deliveryCoef=150;storageCoef=",
    box_delivery_base: 48.5,
    box_delivery_liter: 11,
    box_storage_base: 0.1,
    box_storage_liter: 0.2,
    coefficient: 1.5,
    ...overrides,
});

const repository = (rows: TariffRow[]): TariffRepository => ({
    upsertMany: async () => 0,
    findByDate: async (date) => rows.filter((r) => r.date === date),
    findLatestDate: async () =>
        rows
            .map((r) => r.date)
            .sort()
            .at(-1) ?? null,
    findAll: async () => rows,
});

interface Call {
    method: string;
    args: Record<string, unknown>;
}

function fakeSheets(options: { existingSheets?: Record<string, string[]>; failFor?: Set<string> } = {}) {
    const calls: Call[] = [];
    const existing = options.existingSheets ?? {};
    const record = (method: string) => async (args: Record<string, unknown>) => {
        calls.push({ method, args });
        if (options.failFor?.has(String(args.spreadsheetId))) throw new Error(`quota exceeded for ${args.spreadsheetId}`);
        return { data: {} };
    };
    const client = {
        spreadsheets: {
            get: async (args: Record<string, unknown>) => {
                calls.push({ method: "get", args });
                if (options.failFor?.has(String(args.spreadsheetId))) throw new Error(`quota exceeded for ${args.spreadsheetId}`);
                const titles = existing[String(args.spreadsheetId)] ?? [];
                return { data: { sheets: titles.map((title) => ({ properties: { title } })) } };
            },
            batchUpdate: record("batchUpdate"),
            values: { clear: record("clear"), update: record("update") },
        },
    } as unknown as sheets_v4.Sheets;
    return { client, calls };
}

function makePublisher(sheets: sheets_v4.Sheets, ids: string[], rows: TariffRow[], publishScope: "latest" | "all" = "latest") {
    return new GoogleSheetsPublisher({
        createSheetsClient: async () => sheets,
        repository: repository(rows),
        registry: { getSpreadsheetIds: async () => ids },
        config: { sheetName: "stocks_coefs", publishScope },
        logger: createSilentLogger(),
    });
}

test("writes a header and numeric cells with RAW input", async () => {
    const { client, calls } = fakeSheets({ existingSheets: { s1: ["stocks_coefs"] } });
    const result = await makePublisher(client, ["s1"], [row()]).publish();
    assert.deepEqual(result, { updated: ["s1"], failed: [] });

    const update = calls.find((c) => c.method === "update");
    assert.ok(update);
    assert.equal(update.args.range, "stocks_coefs!A1");
    assert.equal(update.args.valueInputOption, "RAW");
    const values = (update.args.requestBody as { values: unknown[][] }).values;
    assert.deepEqual(values[0], SHEET_HEADERS);
    assert.deepEqual(values[1], ["2025-03-01", "A", "deliveryCoef=150;storageCoef=", 48.5, 11, 0.1, 0.2, 1.5]);
    assert.equal(typeof values[1][3], "number");
    assert.equal(typeof values[1][7], "number");
});

test("clears the range before updating", async () => {
    const { client, calls } = fakeSheets({ existingSheets: { s1: ["stocks_coefs"] } });
    await makePublisher(client, ["s1"], [row()]).publish();
    const methods = calls.map((c) => c.method);
    assert.deepEqual(methods, ["get", "clear", "update"]);
    assert.equal(calls[1].args.range, "stocks_coefs!A1:Z");
});

test("creates the sheet when it is missing", async () => {
    const { client, calls } = fakeSheets({ existingSheets: { s1: ["other"] } });
    await makePublisher(client, ["s1"], [row()]).publish();
    const add = calls.find((c) => c.method === "batchUpdate");
    assert.ok(add);
    assert.deepEqual((add.args.requestBody as { requests: unknown[] }).requests, [{ addSheet: { properties: { title: "stocks_coefs" } } }]);
});

test("publishes only the latest date by default and everything with scope all", async () => {
    const rows = [row({ date: "2025-02-28", warehouse_name: "old" }), row({ date: "2025-03-01", warehouse_name: "new" })];
    const latest = fakeSheets({ existingSheets: { s1: ["stocks_coefs"] } });
    await makePublisher(latest.client, ["s1"], rows, "latest").publish();
    const latestValues = (latest.calls.find((c) => c.method === "update")?.args.requestBody as { values: unknown[][] }).values;
    assert.equal(latestValues.length, 2);
    assert.equal(latestValues[1][1], "new");

    const all = fakeSheets({ existingSheets: { s1: ["stocks_coefs"] } });
    await makePublisher(all.client, ["s1"], rows, "all").publish();
    const allValues = (all.calls.find((c) => c.method === "update")?.args.requestBody as { values: unknown[][] }).values;
    assert.equal(allValues.length, 3);
});

test("writes only the header when there is no data", async () => {
    const { client, calls } = fakeSheets({ existingSheets: { s1: ["stocks_coefs"] } });
    await makePublisher(client, ["s1"], []).publish();
    const values = (calls.find((c) => c.method === "update")?.args.requestBody as { values: unknown[][] }).values;
    assert.deepEqual(values, [SHEET_HEADERS]);
});

test("isolates failures per spreadsheet", async () => {
    const { client } = fakeSheets({ existingSheets: { good: ["stocks_coefs"], bad: ["stocks_coefs"] }, failFor: new Set(["bad"]) });
    const result = await makePublisher(client, ["good", "bad"], [row()]).publish();
    assert.deepEqual(result.updated, ["good"]);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].id, "bad");
    assert.match(result.failed[0].error, /quota exceeded/);
});

test("throws when every spreadsheet fails", async () => {
    const { client } = fakeSheets({ failFor: new Set(["a", "b"]) });
    await assert.rejects(makePublisher(client, ["a", "b"], [row()]).publish(), /All 2 spreadsheet update\(s\) failed/);
});

test("does nothing and does not create a client when no spreadsheets are configured", async () => {
    let created = 0;
    const publisher = new GoogleSheetsPublisher({
        createSheetsClient: async () => {
            created++;
            return fakeSheets().client;
        },
        repository: repository([row()]),
        registry: { getSpreadsheetIds: async () => [] },
        config: { sheetName: "stocks_coefs", publishScope: "latest" },
        logger: createSilentLogger(),
    });
    assert.deepEqual(await publisher.publish(), { updated: [], failed: [] });
    assert.equal(created, 0);
});
