import { WBApiService } from "./wb-api.service.js";
import { TariffsDBService } from "./tariffs-db.service.js";
import { calculateCoefficient, parseNumber } from "./tariff-parsing.js";

export class TariffsSyncService {
    private wbApi: WBApiService;
    private tariffsDB: TariffsDBService;
    private isRunning: boolean = false;

    constructor() {
        this.wbApi = new WBApiService();
        this.tariffsDB = new TariffsDBService();
    }

    async syncTariffs(): Promise<void> {
        if (this.isRunning) {
            console.log("Sync already in progress, skipping...");
            return;
        }

        this.isRunning = true;

        try {
            console.log("Fetching tariffs from WB API...");

            const response = await this.wbApi.fetchTariffs();
            const currentDate = new Date().toISOString().split("T")[0];

            const warehouseList = response.response?.data?.warehouseList || [];

            const tariffs = warehouseList
                .map((warehouse) => {
                    try {
                        const coefficient = calculateCoefficient(warehouse);

                        const tariff = {
                            date: currentDate,
                            warehouse_name: warehouse.warehouseName,
                            box_delivery_and_storage_expr: this.buildExpr(warehouse),
                            box_delivery_base: parseNumber(warehouse.boxDeliveryBase),
                            box_delivery_liter: parseNumber(warehouse.boxDeliveryLiter),
                            box_storage_base: parseNumber(warehouse.boxStorageBase),
                            box_storage_liter: parseNumber(warehouse.boxStorageLiter),
                            coefficient,
                        };

                        this.validateTariff(tariff);
                        return tariff;
                    } catch (error) {
                        console.error(`Skipping invalid warehouse data: ${warehouse.warehouseName}`, error);
                        return null;
                    }
                })
                .filter((t) => t !== null);

            if (tariffs.length === 0) {
                throw new Error("No valid tariffs to save");
            }

            await this.tariffsDB.saveTariffs(tariffs);
            console.log(`Saved ${tariffs.length} tariffs for ${currentDate}`);
        } catch (error) {
            console.error("Error syncing tariffs:", error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    private buildExpr(warehouse: any): string {
        const delivery = warehouse.boxDeliveryCoefExpr ?? "";
        const storage = warehouse.boxStorageCoefExpr ?? "";
        return `deliveryCoef=${delivery};storageCoef=${storage}`;
    }

    private validateTariff(tariff: any): void {
        if (!tariff.warehouse_name || tariff.warehouse_name.trim() === "") {
            throw new Error("Invalid warehouse name");
        }
        if (tariff.coefficient < 0) {
            throw new Error("Invalid coefficient");
        }
    }
}
