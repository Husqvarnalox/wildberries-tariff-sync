import { test } from "node:test";
import assert from "node:assert/strict";
import type { Knex } from "knex";
import { createSilentLogger } from "../lib/logger.js";
import { DbSpreadsheetRegistry } from "./spreadsheet.registry.js";

function fakeKnex(result: () => Promise<{ spreadsheet_id: string | null }[]>): Knex {
    const builder = { select: () => builder, timeout: () => result() };
    return ((_table: string) => builder) as unknown as Knex;
}

test("merges database and config ids, trims and dedupes", async () => {
    const knex = fakeKnex(async () => [{ spreadsheet_id: "db1" }, { spreadsheet_id: " shared " }]);
    const registry = new DbSpreadsheetRegistry(knex, ["shared", "cfg1"], createSilentLogger());
    assert.deepEqual(await registry.getSpreadsheetIds(), ["db1", "shared", "cfg1"]);
});

test("filters blanks, nulls and the example placeholder", async () => {
    const knex = fakeKnex(async () => [{ spreadsheet_id: "example_spreadsheet_id" }, { spreadsheet_id: "  " }, { spreadsheet_id: null }]);
    const registry = new DbSpreadsheetRegistry(knex, ["", "cfg1"], createSilentLogger());
    assert.deepEqual(await registry.getSpreadsheetIds(), ["cfg1"]);
});

test("returns an empty list when nothing is configured", async () => {
    const registry = new DbSpreadsheetRegistry(
        fakeKnex(async () => []),
        [],
        createSilentLogger(),
    );
    assert.deepEqual(await registry.getSpreadsheetIds(), []);
});

test("falls back to config ids when the database fails", async () => {
    const knex = fakeKnex(async () => {
        throw new Error("connection refused");
    });
    const registry = new DbSpreadsheetRegistry(knex, ["cfg1", "example_spreadsheet_id", " "], createSilentLogger());
    assert.deepEqual(await registry.getSpreadsheetIds(), ["cfg1"]);
});
