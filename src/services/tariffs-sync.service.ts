import { WBApiService } from "./wb-api.service.js";
import { TariffsDBService } from "./tariffs-db.service.js";

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
                        const coefficient = this.calculateCoefficient(warehouse);
                        
                        const tariff = {
                            date: currentDate,
                            warehouse_name: warehouse.warehouseName,
                            box_delivery_and_storage_expr: this.buildExpr(warehouse),
                            box_delivery_base: this.parseNumber(warehouse.boxDeliveryBase),
                            box_delivery_liter: this.parseNumber(warehouse.boxDeliveryLiter),
                            box_storage_base: this.parseNumber(warehouse.boxStorageBase),
                            box_storage_liter: this.parseNumber(warehouse.boxStorageLiter),
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

    private calculateCoefficient(warehouse: any): number {
        const raw = warehouse.boxDeliveryCoefExpr ?? warehouse.boxStorageCoefExpr;
        const value = this.parseNumber(raw ?? "100");
        // API отдаёт проценты, нормализуем в коэффициент (100 -> 1.0)
        const coef = value / 100;
        return isNaN(coef) || coef <= 0 ? 1.0 : coef;
    }

    private parseNumber(value: string): number {
        if (value === undefined || value === null) {
            return 0;
        }
        const trimmed = `${value}`.trim();
        if (trimmed === "-" || trimmed === "") {
            return 0;
        }
        const normalized = trimmed.replace(",", ".");
        const num = parseFloat(normalized);
        if (isNaN(num)) {
            throw new Error(`Invalid number: ${value}`);
        }
        return num;
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
