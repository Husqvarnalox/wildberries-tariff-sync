import type { Knex } from "knex";
import type { TariffRow } from "./tariff.model.js";

export interface TariffRepository {
    /** Idempotent upsert keyed by (date, warehouse_name, box_delivery_and_storage_expr). Returns rows written. */
    upsertMany(rows: TariffRow[]): Promise<number>;
    findByDate(date: string): Promise<TariffRow[]>;
    findLatestDate(): Promise<string | null>;
    findAll(): Promise<TariffRow[]>;
}

export interface KnexTariffRepositoryOptions {
    batchSize?: number;
    queryTimeoutMs?: number;
}

const TABLE = "wb_tariffs";
const COLUMNS = [
    "date",
    "warehouse_name",
    "box_delivery_and_storage_expr",
    "box_delivery_base",
    "box_delivery_liter",
    "box_storage_base",
    "box_storage_liter",
    "coefficient",
] as const;
const CONFLICT_KEY = ["date", "warehouse_name", "box_delivery_and_storage_expr"];
const MERGE_COLUMNS = ["box_delivery_base", "box_delivery_liter", "box_storage_base", "box_storage_liter", "coefficient"];

function toIsoDate(value: unknown): string {
    // node-postgres parses a DATE column as local midnight, so read the local calendar fields (toISOString would shift the day in UTC+ zones).
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    return String(value).slice(0, 10);
}

function mapRow(raw: Record<string, unknown>): TariffRow {
    return {
        date: toIsoDate(raw.date),
        warehouse_name: String(raw.warehouse_name),
        box_delivery_and_storage_expr: String(raw.box_delivery_and_storage_expr),
        box_delivery_base: Number(raw.box_delivery_base),
        box_delivery_liter: Number(raw.box_delivery_liter),
        box_storage_base: Number(raw.box_storage_base),
        box_storage_liter: Number(raw.box_storage_liter),
        coefficient: Number(raw.coefficient),
    };
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}

export class KnexTariffRepository implements TariffRepository {
    private readonly batchSize: number;
    private readonly queryTimeoutMs: number;

    constructor(
        private readonly knex: Knex,
        options: KnexTariffRepositoryOptions = {},
    ) {
        this.batchSize = options.batchSize ?? 200;
        this.queryTimeoutMs = options.queryTimeoutMs ?? 30_000;
    }

    async upsertMany(rows: TariffRow[]): Promise<number> {
        // A single INSERT cannot touch the same key twice, so keep the last occurrence of each key.
        const unique = [...new Map(rows.map((row) => [`${row.date}\u0000${row.warehouse_name}\u0000${row.box_delivery_and_storage_expr}`, row])).values()];
        if (unique.length === 0) return 0;

        return this.knex.transaction(async (trx) => {
            const merge: Record<string, unknown> = Object.fromEntries(MERGE_COLUMNS.map((column) => [column, trx.raw("excluded.??", [column])]));
            merge.updated_at = trx.fn.now();
            for (const batch of chunk(unique, this.batchSize)) {
                await trx(TABLE).insert(batch).onConflict(CONFLICT_KEY).merge(merge).timeout(this.queryTimeoutMs);
            }
            return unique.length;
        });
    }

    async findByDate(date: string): Promise<TariffRow[]> {
        const raw = await this.baseQuery().where("date", date);
        return raw.map(mapRow);
    }

    async findLatestDate(): Promise<string | null> {
        const result = await this.knex(TABLE).max("date as max_date").first().timeout(this.queryTimeoutMs);
        const value = (result as { max_date?: unknown } | undefined)?.max_date;
        return value ? toIsoDate(value) : null;
    }

    async findAll(): Promise<TariffRow[]> {
        const raw = await this.baseQuery();
        return raw.map(mapRow);
    }

    private baseQuery() {
        return this.knex(TABLE)
            .select(...COLUMNS)
            .orderBy([
                { column: "date", order: "asc" },
                { column: "coefficient", order: "asc" },
                { column: "warehouse_name", order: "asc" },
            ])
            .timeout(this.queryTimeoutMs);
    }
}
