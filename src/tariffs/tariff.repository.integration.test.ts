import { test, after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import knexFactory, { type Knex } from "knex";
import { KnexTariffRepository } from "./tariff.repository.js";
import type { TariffRow } from "./tariff.model.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

const row = (overrides: Partial<TariffRow> = {}): TariffRow => ({
    date: "2025-03-01",
    warehouse_name: "A",
    box_delivery_and_storage_expr: "deliveryCoef=100;storageCoef=100",
    box_delivery_base: 10.5,
    box_delivery_liter: 2,
    box_storage_base: 0.1,
    box_storage_liter: 0.2,
    coefficient: 1,
    ...overrides,
});

if (!databaseUrl) {
    test.skip("tariff repository integration (TEST_DATABASE_URL is not set)", () => {});
} else {
    let knex: Knex;
    let repository: KnexTariffRepository;

    before(async () => {
        knex = knexFactory({
            client: "pg",
            connection: databaseUrl,
            pool: { min: 0, max: 4 },
            migrations: { directory: "./src/postgres/migrations", tableName: "migrations", extension: "js" },
        });
        await knex.migrate.latest();
        repository = new KnexTariffRepository(knex, { batchSize: 2 });
    });

    beforeEach(async () => {
        await knex("wb_tariffs").truncate();
    });

    after(async () => {
        await knex.migrate.rollback(undefined, true);
        await knex.destroy();
    });

    test("upsert is idempotent and updates values for the same key", async () => {
        assert.equal(await repository.upsertMany([row()]), 1);
        assert.equal(await repository.upsertMany([row({ box_delivery_base: 99.25, coefficient: 2.5 })]), 1);
        const all = await repository.findAll();
        assert.equal(all.length, 1);
        assert.equal(all[0].box_delivery_base, 99.25);
        assert.equal(all[0].coefficient, 2.5);
    });

    test("upsert refreshes updated_at on conflict", async () => {
        await repository.upsertMany([row()]);
        await knex("wb_tariffs").update({ updated_at: new Date("2020-01-01T00:00:00Z") });
        await repository.upsertMany([row()]);
        const [{ updated_at }] = await knex("wb_tariffs").select("updated_at");
        assert.ok(new Date(updated_at).getFullYear() >= 2025);
    });

    test("upsert spans multiple batches and deduplicates identical keys within a call", async () => {
        const rows = ["A", "B", "C", "D", "E"].map((name) => row({ warehouse_name: name }));
        assert.equal(await repository.upsertMany([...rows, row({ warehouse_name: "A", coefficient: 3 })]), 5);
        const all = await repository.findAll();
        assert.equal(all.length, 5);
        assert.equal(all.find((r) => r.warehouse_name === "A")?.coefficient, 3);
    });

    test("upsert of an empty list is a no-op", async () => {
        assert.equal(await repository.upsertMany([]), 0);
    });

    test("findLatestDate returns an ISO date string or null", async () => {
        assert.equal(await repository.findLatestDate(), null);
        await repository.upsertMany([row({ date: "2025-02-27" }), row({ date: "2025-03-02" })]);
        assert.equal(await repository.findLatestDate(), "2025-03-02");
    });

    test("findAll orders by date, coefficient, warehouse_name and maps types", async () => {
        await repository.upsertMany([
            row({ date: "2025-03-02", warehouse_name: "Z", coefficient: 1 }),
            row({ date: "2025-03-01", warehouse_name: "B", coefficient: 2 }),
            row({ date: "2025-03-01", warehouse_name: "C", coefficient: 1 }),
            row({ date: "2025-03-01", warehouse_name: "A", coefficient: 1 }),
        ]);
        const all = await repository.findAll();
        assert.deepEqual(
            all.map((r) => `${r.date}:${r.warehouse_name}`),
            ["2025-03-01:A", "2025-03-01:C", "2025-03-01:B", "2025-03-02:Z"],
        );
        assert.equal(typeof all[0].box_delivery_base, "number");
        assert.equal(all[0].box_delivery_base, 10.5);
        assert.match(all[0].date, /^\d{4}-\d{2}-\d{2}$/);
    });

    test("findByDate returns only that date", async () => {
        await repository.upsertMany([row({ date: "2025-03-01" }), row({ date: "2025-03-02", warehouse_name: "B" })]);
        const rows = await repository.findByDate("2025-03-02");
        assert.deepEqual(
            rows.map((r) => r.warehouse_name),
            ["B"],
        );
    });
}
