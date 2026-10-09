import type { sheets_v4 } from "googleapis";
import type { Logger } from "../lib/logger.js";
import type { TariffRow } from "../tariffs/tariff.model.js";
import type { TariffRepository } from "../tariffs/tariff.repository.js";
import type { SpreadsheetRegistry } from "./spreadsheet.registry.js";

export const SHEET_HEADERS = ["Дата", "Склад", "Формула", "Доставка база", "Доставка литр", "Хранение база", "Хранение литр", "Коэффициент"];

export interface PublishResult {
    updated: string[];
    failed: { id: string; error: string }[];
}

export interface GoogleSheetsPublisherDeps {
    createSheetsClient: () => Promise<sheets_v4.Sheets>;
    repository: TariffRepository;
    registry: SpreadsheetRegistry;
    config: { sheetName: string; publishScope: "latest" | "all" };
    logger: Logger;
}

function toValues(rows: TariffRow[]): (string | number)[][] {
    return [
        SHEET_HEADERS,
        ...rows.map((r) => [
            r.date,
            r.warehouse_name,
            r.box_delivery_and_storage_expr,
            r.box_delivery_base,
            r.box_delivery_liter,
            r.box_storage_base,
            r.box_storage_liter,
            r.coefficient,
        ]),
    ];
}

export class GoogleSheetsPublisher {
    constructor(private readonly deps: GoogleSheetsPublisherDeps) {}

    async publish(): Promise<PublishResult> {
        const { registry, config, logger } = this.deps;

        const ids = await registry.getSpreadsheetIds();
        if (ids.length === 0) {
            logger.warn("No spreadsheet ids configured, nothing to publish");
            return { updated: [], failed: [] };
        }

        const rows = await this.loadRows();
        const values = toValues(rows);
        const sheets = await this.deps.createSheetsClient();

        const settled = await Promise.allSettled(ids.map((id) => this.publishTo(sheets, id, values)));
        const result: PublishResult = { updated: [], failed: [] };
        settled.forEach((outcome, index) => {
            const id = ids[index];
            if (outcome.status === "fulfilled") {
                result.updated.push(id);
            } else {
                const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
                logger.error({ spreadsheetId: id, err: outcome.reason }, "Failed to update spreadsheet");
                result.failed.push({ id, error });
            }
        });

        logger.info({ updated: result.updated.length, failed: result.failed.length, rows: rows.length, scope: config.publishScope }, "Sheets publish finished");
        if (result.updated.length === 0) {
            throw new Error(`All ${ids.length} spreadsheet update(s) failed: ${result.failed.map((f) => `${f.id}: ${f.error}`).join("; ")}`);
        }
        return result;
    }

    private async loadRows(): Promise<TariffRow[]> {
        const { repository, config } = this.deps;
        if (config.publishScope === "all") return repository.findAll();
        const latest = await repository.findLatestDate();
        return latest ? repository.findByDate(latest) : [];
    }

    private async publishTo(sheets: sheets_v4.Sheets, spreadsheetId: string, values: (string | number)[][]): Promise<void> {
        const { sheetName } = this.deps.config;
        await this.ensureSheetExists(sheets, spreadsheetId, sheetName);
        await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A1:Z` });
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: { values },
        });
        this.deps.logger.debug({ spreadsheetId, rows: values.length - 1 }, "Spreadsheet updated");
    }

    private async ensureSheetExists(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<void> {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        if ((meta.data.sheets ?? []).some((sheet) => sheet.properties?.title === sheetName)) return;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
        });
        this.deps.logger.info({ spreadsheetId, sheetName }, "Created missing sheet");
    }
}
