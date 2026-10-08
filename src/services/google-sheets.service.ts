import { google, sheets_v4 } from "googleapis";
import { readFile } from "fs/promises";
import env from "#config/env/env.js";
import { TariffsDBService } from "./tariffs-db.service.js";
import knex from "#postgres/knex.js";

export class GoogleSheetsService {
    private tariffsDB: TariffsDBService;
    private cachedAuth: any = null;
    private cacheTime: number = 0;
    private readonly cacheTTL: number = 3600000;
    private isRunning: boolean = false;
    private readonly sheetName: string = "stocks_coefs";

    constructor() {
        this.tariffsDB = new TariffsDBService();
    }

    async updateSpreadsheets(): Promise<void> {
        if (this.isRunning) {
            console.log("Sheets update already in progress, skipping...");
            return;
        }

        this.isRunning = true;

        try {
            console.log("Updating Google Sheets...");

            const auth = await this.getAuth();
            const sheets = google.sheets({ version: "v4", auth });
            const tariffs = await this.tariffsDB.getAllTariffsOrdered();

            if (tariffs.length === 0) {
                console.log("No tariffs found in database, will still ensure sheet structure exists");
            }

            const spreadsheetIds = await this.getSpreadsheetIds();

            if (spreadsheetIds.length === 0) {
                console.log("No spreadsheet IDs configured");
                return;
            }

            const updatePromises = spreadsheetIds.map((id) => this.updateSpreadsheetSafe(sheets, id, tariffs));

            const results = await Promise.allSettled(updatePromises);
            const successCount = results.filter((r) => r.status === "fulfilled").length;

            console.log(`Updated ${successCount}/${spreadsheetIds.length} spreadsheet(s)`);
        } catch (error) {
            console.error("Error updating spreadsheets:", error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    private async getAuth(): Promise<any> {
        const now = Date.now();

        if (this.cachedAuth && now - this.cacheTime < this.cacheTTL) {
            return this.cachedAuth;
        }

        try {
            const credentialsContent = await readFile(env.GOOGLE_CREDENTIALS_PATH, "utf-8");
            const credentials = JSON.parse(credentialsContent);

            this.validateCredentials(credentials);

            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ["https://www.googleapis.com/auth/spreadsheets"],
            });

            this.cachedAuth = auth;
            this.cacheTime = now;

            return auth;
        } catch (error) {
            console.error("Error loading Google credentials:", error);
            throw new Error("Failed to load Google credentials");
        }
    }

    private validateCredentials(credentials: any): void {
        if (!credentials || typeof credentials !== "object") {
            throw new Error("Invalid credentials format");
        }
        if (!credentials.client_email || !credentials.private_key) {
            throw new Error("Missing required credential fields");
        }
    }

    private async getSpreadsheetIds(): Promise<string[]> {
        try {
            const storedIds = await knex("spreadsheets")
                .select("spreadsheet_id")
                .timeout(5000)
                .then((rows) => rows.map((r) => r.spreadsheet_id).filter((id) => id));

            const validStored = storedIds.filter((id) => id && id.trim() !== "" && id !== "example_spreadsheet_id");
            const envIds = env.SPREADSHEET_IDS.filter((id) => id && id.trim() !== "");

            const merged = Array.from(new Set([...validStored, ...envIds]));

            if (merged.length > 0) {
                return merged;
            }

            return [];
        } catch (error) {
            console.error("Error fetching spreadsheet IDs from DB:", error);
            return env.SPREADSHEET_IDS.filter((id) => id && id.trim() !== "");
        }
    }

    private async updateSpreadsheetSafe(sheets: sheets_v4.Sheets, spreadsheetId: string, tariffs: any[]): Promise<void> {
        try {
            await this.updateSpreadsheet(sheets, spreadsheetId, tariffs);
        } catch (error) {
            console.error(`Failed to update spreadsheet ${spreadsheetId}:`, error);
            throw error;
        }
    }

    private async updateSpreadsheet(sheets: sheets_v4.Sheets, spreadsheetId: string, tariffs: any[]): Promise<void> {
        await this.ensureSheetExists(sheets, spreadsheetId, this.sheetName);

        const headers = ["Дата", "Склад", "Формула", "Доставка база", "Доставка литр", "Хранение база", "Хранение литр", "Коэффициент"];

        const rows = tariffs.map((t) => [
            t.date || "",
            t.warehouse_name || "",
            t.box_delivery_and_storage_expr || "",
            t.box_delivery_base || 0,
            t.box_delivery_liter || 0,
            t.box_storage_base || 0,
            t.box_storage_liter || 0,
            t.coefficient || 0,
        ]);

        const values = [headers, ...rows];

        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${this.sheetName}!A1:Z`,
        });

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${this.sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: {
                values,
            },
        });

        console.log(`Updated spreadsheet ${spreadsheetId}`);
    }

    private async ensureSheetExists(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<void> {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const hasSheet = (meta.data.sheets || []).some((sheet) => sheet.properties?.title === sheetName);

        if (hasSheet) {
            return;
        }

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: sheetName,
                            },
                        },
                    },
                ],
            },
        });

        console.log(`Created sheet "${sheetName}" in spreadsheet ${spreadsheetId}`);
    }
}
