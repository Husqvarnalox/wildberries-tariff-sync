import type { Knex } from "knex";
import type { Logger } from "../lib/logger.js";

export const PLACEHOLDER_SPREADSHEET_ID = "example_spreadsheet_id";

export interface SpreadsheetRegistry {
    getSpreadsheetIds(): Promise<string[]>;
}

function clean(ids: Iterable<string | null | undefined>): string[] {
    const result = new Set<string>();
    for (const id of ids) {
        const trimmed = id?.trim();
        if (trimmed && trimmed !== PLACEHOLDER_SPREADSHEET_ID) result.add(trimmed);
    }
    return [...result];
}

/** Spreadsheet ids come from the `spreadsheets` table merged with the SPREADSHEET_IDS config. */
export class DbSpreadsheetRegistry implements SpreadsheetRegistry {
    constructor(
        private readonly knex: Knex,
        private readonly configIds: string[],
        private readonly logger: Logger,
    ) {}

    async getSpreadsheetIds(): Promise<string[]> {
        try {
            const rows: { spreadsheet_id: string | null }[] = await this.knex("spreadsheets").select("spreadsheet_id").timeout(5000);
            return clean([...rows.map((row) => row.spreadsheet_id), ...this.configIds]);
        } catch (err) {
            this.logger.error({ err }, "Failed to read spreadsheet ids from the database, falling back to configured ids");
            return clean(this.configIds);
        }
    }
}
