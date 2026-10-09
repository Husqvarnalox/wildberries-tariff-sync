import { test } from "node:test";
import assert from "node:assert/strict";
import type { Logger } from "../lib/logger.js";
import { normalizeWarehouses } from "./tariff.normalizer.js";

function recordingLogger() {
    const warnings: Record<string, unknown>[] = [];
    const logger = { warn: (obj: Record<string, unknown>) => warnings.push(obj) } as unknown as Logger;
    return { logger, warnings };
}

const DATE = "2025-03-01";

test("maps a valid warehouse to a row", () => {
    const { logger } = recordingLogger();
    const { rows, skipped } = normalizeWarehouses(
        [
            {
                warehouseName: "Коледино",
                boxDeliveryBase: "48,5",
                boxDeliveryLiter: "11,2",
                boxStorageBase: "0,1",
                boxStorageLiter: "0,1",
                boxDeliveryCoefExpr: "150",
                boxStorageCoefExpr: "120",
            },
        ],
        DATE,
        logger,
    );
    assert.equal(skipped, 0);
    assert.deepEqual(rows, [
        {
            date: DATE,
            warehouse_name: "Коледино",
            box_delivery_and_storage_expr: "deliveryCoef=150;storageCoef=120",
            box_delivery_base: 48.5,
            box_delivery_liter: 11.2,
            box_storage_base: 0.1,
            box_storage_liter: 0.1,
            coefficient: 1.5,
        },
    ]);
});

test("builds the expression with empty parts when coefficients are missing", () => {
    const { logger } = recordingLogger();
    const { rows } = normalizeWarehouses([{ warehouseName: "A" }], DATE, logger);
    assert.equal(rows[0].box_delivery_and_storage_expr, "deliveryCoef=;storageCoef=");
    assert.equal(rows[0].coefficient, 1);
    assert.equal(rows[0].box_delivery_base, 0);
});

test("falls back to the storage coefficient when delivery is absent", () => {
    const { logger } = recordingLogger();
    const { rows } = normalizeWarehouses([{ warehouseName: "A", boxStorageCoefExpr: "80" }], DATE, logger);
    assert.equal(rows[0].coefficient, 0.8);
    assert.equal(rows[0].box_delivery_and_storage_expr, "deliveryCoef=;storageCoef=80");
});

test("trims the warehouse name", () => {
    const { logger } = recordingLogger();
    const { rows } = normalizeWarehouses([{ warehouseName: "  Тула  " }], DATE, logger);
    assert.equal(rows[0].warehouse_name, "Тула");
});

test("skips blank names and unparsable numbers, logging each", () => {
    const { logger, warnings } = recordingLogger();
    const { rows, skipped } = normalizeWarehouses(
        [{ warehouseName: "  " }, { warehouseName: null }, { warehouseName: "Bad", boxDeliveryBase: "abc" }, { warehouseName: "Good" }],
        DATE,
        logger,
    );
    assert.equal(skipped, 3);
    assert.deepEqual(
        rows.map((r) => r.warehouse_name),
        ["Good"],
    );
    assert.equal(warnings.length, 3);
    assert.equal(warnings[2].warehouseName, "Bad");
    assert.match(String(warnings[2].reason), /Invalid number/);
});

test("returns an empty result for an empty list", () => {
    const { logger } = recordingLogger();
    assert.deepEqual(normalizeWarehouses([], DATE, logger), { rows: [], skipped: 0 });
});
