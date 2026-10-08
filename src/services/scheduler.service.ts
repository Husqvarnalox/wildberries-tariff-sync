import { TariffsSyncService } from "./tariffs-sync.service.js";
import { GoogleSheetsService } from "./google-sheets.service.js";

export class SchedulerService {
    private tariffsSyncService: TariffsSyncService;
    private googleSheetsService: GoogleSheetsService;
    private tariffsInterval: NodeJS.Timeout | null = null;
    private sheetsInterval: NodeJS.Timeout | null = null;
    private errorCount: Map<string, number> = new Map();
    private readonly maxErrors: number = 5;
    private readonly errorResetTime: number = 3600000;

    constructor() {
        this.tariffsSyncService = new TariffsSyncService();
        this.googleSheetsService = new GoogleSheetsService();
    }

    start(): void {
        console.log("Starting scheduler...");

        this.syncTariffsTask();
        this.tariffsInterval = setInterval(
            () => {
                this.syncTariffsTask();
            },
            60 * 60 * 1000,
        );

        this.updateSheetsTask();
        this.sheetsInterval = setInterval(
            () => {
                this.updateSheetsTask();
            },
            60 * 60 * 1000,
        );

        console.log("Scheduler started:");
        console.log("- Tariffs sync: every hour");
        console.log("- Google Sheets update: every hour");
    }

    stop(): void {
        if (this.tariffsInterval) {
            clearInterval(this.tariffsInterval);
            this.tariffsInterval = null;
        }
        if (this.sheetsInterval) {
            clearInterval(this.sheetsInterval);
            this.sheetsInterval = null;
        }
        console.log("Scheduler stopped");
    }

    private async syncTariffsTask(): Promise<void> {
        const taskName = "tariffs_sync";

        if (this.isCircuitBreakerOpen(taskName)) {
            console.log(`Circuit breaker open for ${taskName}, skipping task`);
            return;
        }

        try {
            console.log(`[${new Date().toISOString()}] Running tariffs sync...`);
            await this.tariffsSyncService.syncTariffs();
            this.resetErrorCount(taskName);
        } catch (error) {
            console.error("Error in tariffs sync task:", error);
            this.incrementErrorCount(taskName);
        }
    }

    private async updateSheetsTask(): Promise<void> {
        const taskName = "sheets_update";

        if (this.isCircuitBreakerOpen(taskName)) {
            console.log(`Circuit breaker open for ${taskName}, skipping task`);
            return;
        }

        try {
            console.log(`[${new Date().toISOString()}] Running Google Sheets update...`);
            await this.googleSheetsService.updateSpreadsheets();
            this.resetErrorCount(taskName);
        } catch (error) {
            console.error("Error in Google Sheets update task:", error);
            this.incrementErrorCount(taskName);
        }
    }

    private incrementErrorCount(taskName: string): void {
        const currentCount = this.errorCount.get(taskName) || 0;
        const newCount = currentCount + 1;
        this.errorCount.set(taskName, newCount);

        if (newCount >= this.maxErrors) {
            console.error(`Circuit breaker opened for ${taskName} after ${newCount} errors`);
            setTimeout(() => {
                this.resetErrorCount(taskName);
                console.log(`Circuit breaker reset for ${taskName}`);
            }, this.errorResetTime);
        }
    }

    private resetErrorCount(taskName: string): void {
        this.errorCount.set(taskName, 0);
    }

    private isCircuitBreakerOpen(taskName: string): boolean {
        const count = this.errorCount.get(taskName) || 0;
        return count >= this.maxErrors;
    }
}
