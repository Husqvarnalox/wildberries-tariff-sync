import type { Clock } from "../lib/clock.js";
import { todayIsoDate } from "../lib/clock.js";
import type { Logger } from "../lib/logger.js";
import type { TariffsSource } from "../wb/wb-api.client.js";
import { normalizeWarehouses } from "./tariff.normalizer.js";
import type { TariffRepository } from "./tariff.repository.js";

export class NoValidTariffsError extends Error {
    constructor(skipped: number) {
        super(`No valid tariffs to save (${skipped} warehouse(s) skipped)`);
        this.name = "NoValidTariffsError";
    }
}

export interface SyncResult {
    date: string;
    saved: number;
    skipped: number;
}

export interface TariffsSyncDeps {
    source: TariffsSource;
    repository: TariffRepository;
    clock: Clock;
    logger: Logger;
}

/** Callers (the scheduler) guarantee runs never overlap, so no re-entrancy guard is kept here. */
export class TariffsSyncService {
    constructor(private readonly deps: TariffsSyncDeps) {}

    async sync(): Promise<SyncResult> {
        const { source, repository, clock, logger } = this.deps;
        const date = todayIsoDate(clock);

        const response = await source.fetchBoxTariffs(date);
        const { rows, skipped } = normalizeWarehouses(response.response.data.warehouseList, date, logger);
        if (rows.length === 0) {
            throw new NoValidTariffsError(skipped);
        }

        const saved = await repository.upsertMany(rows);
        logger.info({ date, saved, skipped }, "Tariffs synced");
        return { date, saved, skipped };
    }
}
