import type { Logger } from "../lib/logger.js";
import type { WbWarehouseTariff } from "../wb/wb-tariffs.schema.js";
import type { TariffRow } from "./tariff.model.js";
import { calculateCoefficient, parseNumber } from "./tariff-parsing.js";

export interface NormalizeResult {
    rows: TariffRow[];
    skipped: number;
}

function asOptionalString(value: string | number | null | undefined): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
}

function normalizeOne(warehouse: WbWarehouseTariff, date: string): TariffRow {
    const warehouseName = warehouse.warehouseName?.trim();
    if (!warehouseName) {
        throw new Error("blank warehouse name");
    }
    const deliveryExpr = asOptionalString(warehouse.boxDeliveryCoefExpr);
    const storageExpr = asOptionalString(warehouse.boxStorageCoefExpr);
    const coefficient = calculateCoefficient({ boxDeliveryCoefExpr: deliveryExpr, boxStorageCoefExpr: storageExpr });

    return {
        date,
        warehouse_name: warehouseName,
        box_delivery_and_storage_expr: `deliveryCoef=${deliveryExpr ?? ""};storageCoef=${storageExpr ?? ""}`,
        box_delivery_base: parseNumber(warehouse.boxDeliveryBase),
        box_delivery_liter: parseNumber(warehouse.boxDeliveryLiter),
        box_storage_base: parseNumber(warehouse.boxStorageBase),
        box_storage_liter: parseNumber(warehouse.boxStorageLiter),
        coefficient,
    };
}

/** Pure mapping of WB warehouses to DB rows; invalid warehouses are skipped and logged. */
export function normalizeWarehouses(warehouses: WbWarehouseTariff[], date: string, logger: Logger): NormalizeResult {
    const rows: TariffRow[] = [];
    let skipped = 0;
    for (const warehouse of warehouses) {
        try {
            rows.push(normalizeOne(warehouse, date));
        } catch (error) {
            skipped += 1;
            logger.warn(
                { warehouseName: warehouse.warehouseName ?? null, reason: error instanceof Error ? error.message : String(error) },
                "Skipping invalid warehouse",
            );
        }
    }
    return { rows, skipped };
}
