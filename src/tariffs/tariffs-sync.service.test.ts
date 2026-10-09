import { test } from "node:test";
import assert from "node:assert/strict";
import { createSilentLogger } from "../lib/logger.js";
import type { TariffsSource } from "../wb/wb-api.client.js";
import type { WbWarehouseTariff } from "../wb/wb-tariffs.schema.js";
import type { TariffRow } from "./tariff.model.js";
import type { TariffRepository } from "./tariff.repository.js";
import { NoValidTariffsError, TariffsSyncService } from "./tariffs-sync.service.js";

class InMemoryRepository implements TariffRepository {
    readonly rows = new Map<string, TariffRow>();
    async upsertMany(rows: TariffRow[]): Promise<number> {
        for (const row of rows) this.rows.set(`${row.date}|${row.warehouse_name}|${row.box_delivery_and_storage_expr}`, row);
        return rows.length;
    }
    async findByDate(date: string) {
        return [...this.rows.values()].filter((r) => r.date === date);
    }
    async findLatestDate() {
        return (
            [...this.rows.values()]
                .map((r) => r.date)
                .sort()
                .at(-1) ?? null
        );
    }
    async findAll() {
        return [...this.rows.values()];
    }
}

function makeService(warehouseList: WbWarehouseTariff[]) {
    const requestedDates: string[] = [];
    const source: TariffsSource = {
        fetchBoxTariffs: async (date) => {
            requestedDates.push(date);
            return { response: { data: { warehouseList } } };
        },
    };
    const repository = new InMemoryRepository();
    const service = new TariffsSyncService({
        source,
        repository,
        clock: { now: () => new Date("2025-03-01T23:30:00Z") },
        logger: createSilentLogger(),
    });
    return { service, repository, requestedDates };
}

test("saves valid rows and reports saved/skipped counts for the UTC date", async () => {
    const { service, repository, requestedDates } = makeService([
        { warehouseName: "A" },
        { warehouseName: "B", boxDeliveryBase: "1,5" },
        { warehouseName: "" },
    ]);
    const result = await service.sync();
    assert.deepEqual(result, { date: "2025-03-01", saved: 2, skipped: 1 });
    assert.deepEqual(requestedDates, ["2025-03-01"]);
    assert.equal(repository.rows.size, 2);
});

test("is idempotent for repeated runs on the same day", async () => {
    const { service, repository } = makeService([{ warehouseName: "A" }]);
    await service.sync();
    await service.sync();
    assert.equal(repository.rows.size, 1);
});

test("throws NoValidTariffsError when nothing is valid", async () => {
    const { service, repository } = makeService([{ warehouseName: "  " }]);
    await assert.rejects(service.sync(), NoValidTariffsError);
    assert.equal(repository.rows.size, 0);
});

test("throws NoValidTariffsError for an empty warehouse list", async () => {
    const { service } = makeService([]);
    await assert.rejects(service.sync(), NoValidTariffsError);
});

test("propagates source errors", async () => {
    const service = new TariffsSyncService({
        source: {
            fetchBoxTariffs: async () => {
                throw new Error("upstream down");
            },
        },
        repository: new InMemoryRepository(),
        clock: { now: () => new Date() },
        logger: createSilentLogger(),
    });
    await assert.rejects(service.sync(), /upstream down/);
});
