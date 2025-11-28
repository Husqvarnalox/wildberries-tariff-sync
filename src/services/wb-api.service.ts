import env from "#config/env/env.js";

interface WBTariffResponse {
    response: {
        data: {
            dtNextBox: string;
            dtTillMax: string;
            warehouseList: Array<{
                warehouseName: string;
                boxDeliveryBase: string;
                boxDeliveryLiter: string;
                boxStorageBase: string;
                boxStorageLiter: string;
                boxDeliveryCoefExpr: string;
                boxStorageCoefExpr: string;
                geoName: string;
            }>;
        };
    };
}

export class WBApiService {
    private readonly apiUrl = "https://common-api.wildberries.ru/api/v1/tariffs/box";
    private readonly token: string;
    private readonly timeout: number = 30000;
    private readonly maxRetries: number = 3;
    private readonly retryDelay: number = 2000;

    constructor() {
        this.token = env.WBTOKEN;
    }

    async fetchTariffs(): Promise<WBTariffResponse> {
        const date = this.getTodayDate();
        return this.fetchWithRetry(date);
    }

    private getTodayDate(): string {
        return new Date().toISOString().split("T")[0];
    }

    private async fetchWithRetry(date: string, attempt: number = 1): Promise<WBTariffResponse> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const url = `${this.apiUrl}?date=${date}`;

            const response = await fetch(url, {
                headers: {
                    Authorization: this.token,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`WB API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.validateResponse(data);
            
            return data;
        } catch (error) {
            if (attempt < this.maxRetries) {
                console.log(`Retry attempt ${attempt}/${this.maxRetries} after ${this.retryDelay}ms`);
                await this.sleep(this.retryDelay * attempt);
                return this.fetchWithRetry(date, attempt + 1);
            }
            throw error;
        }
    }

    private validateResponse(data: any): void {
        if (!data || typeof data !== "object") {
            throw new Error("Invalid API response format");
        }
        if (!data.response || !data.response.data) {
            throw new Error("Missing response.data in API response");
        }
        if (!Array.isArray(data.response.data.warehouseList)) {
            throw new Error("Missing or invalid warehouseList in response");
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
