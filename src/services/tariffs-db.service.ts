import knex from "#postgres/knex.js";

interface TariffData {
    date: string;
    warehouse_name: string;
    box_delivery_and_storage_expr: string;
    box_delivery_base: number;
    box_delivery_liter: number;
    box_storage_base: number;
    box_storage_liter: number;
    coefficient: number;
}

export class TariffsDBService {
    private readonly queryTimeout: number = 30000;
    private readonly batchSize: number = 100;
    private readonly defaultOrder = [
        { column: "date", order: "asc" as const },
        { column: "coefficient", order: "asc" as const },
    ];

    async saveTariffs(tariffs: TariffData[]): Promise<void> {
        if (!tariffs || tariffs.length === 0) {
            throw new Error("No tariffs to save");
        }

        const batches = this.chunkArray(tariffs, this.batchSize);

        for (const batch of batches) {
            await this.saveBatch(batch);
        }
    }

    private async saveBatch(batch: TariffData[]): Promise<void> {
        const trx = await knex.transaction();

        try {
            for (const tariff of batch) {
                await trx("wb_tariffs")
                    .insert({
                        ...tariff,
                        created_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    })
                    .onConflict(["date", "warehouse_name", "box_delivery_and_storage_expr"])
                    .merge({
                        box_delivery_base: tariff.box_delivery_base,
                        box_delivery_liter: tariff.box_delivery_liter,
                        box_storage_base: tariff.box_storage_base,
                        box_storage_liter: tariff.box_storage_liter,
                        coefficient: tariff.coefficient,
                        updated_at: trx.fn.now(),
                    })
                    .timeout(this.queryTimeout);
            }

            await trx.commit();
        } catch (error) {
            await trx.rollback();
            console.error("Error saving tariffs batch:", error);
            throw error;
        }
    }

    async getTariffsForDate(date: string): Promise<TariffData[]> {
        if (!date || !this.isValidDate(date)) {
            throw new Error("Invalid date format");
        }

        return await knex("wb_tariffs")
            .select(
                "date",
                "warehouse_name",
                "box_delivery_and_storage_expr",
                "box_delivery_base",
                "box_delivery_liter",
                "box_storage_base",
                "box_storage_liter",
                "coefficient"
            )
            .where("date", date)
            .orderBy(this.defaultOrder)
            .timeout(this.queryTimeout);
    }

    async getLatestTariffs(): Promise<TariffData[]> {
        const latestDate = await knex("wb_tariffs")
            .max("date as max_date")
            .first()
            .timeout(this.queryTimeout);

        if (!latestDate?.max_date) {
            return [];
        }

        const normalizedDate =
            typeof latestDate.max_date === "string"
                ? latestDate.max_date
                : this.formatDate(latestDate.max_date);

        return this.getTariffsForDate(normalizedDate);
    }

    async getAllTariffsOrdered(): Promise<TariffData[]> {
        return await knex("wb_tariffs")
            .select(
                "date",
                "warehouse_name",
                "box_delivery_and_storage_expr",
                "box_delivery_base",
                "box_delivery_liter",
                "box_storage_base",
                "box_storage_liter",
                "coefficient"
            )
            .orderBy(this.defaultOrder)
            .timeout(this.queryTimeout);
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    private isValidDate(dateString: string): boolean {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) {
            return false;
        }
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime());
    }

    private formatDate(date: Date): string {
        if (!(date instanceof Date)) {
            throw new Error("Invalid date object");
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
}
