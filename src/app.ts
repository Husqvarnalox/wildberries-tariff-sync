import dotenv from "dotenv";
import { google } from "googleapis";
import { loadConfigOrExit } from "./config/env.js";
import { startHealthServer } from "./http/health.server.js";
import { systemClock } from "./lib/clock.js";
import { createLogger } from "./lib/logger.js";
import { createKnex, createMigrator } from "./postgres/knex.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { GoogleSheetsPublisher } from "./sheets/google-sheets.publisher.js";
import { loadGoogleAuth } from "./sheets/google-auth.js";
import { DbSpreadsheetRegistry } from "./sheets/spreadsheet.registry.js";
import { KnexTariffRepository } from "./tariffs/tariff.repository.js";
import { TariffsSyncService } from "./tariffs/tariffs-sync.service.js";
import { WbApiClient } from "./wb/wb-api.client.js";

dotenv.config();

const config = loadConfigOrExit(process.env);
const logger = createLogger({ level: config.log.level, pretty: config.nodeEnv !== "production" });

process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    process.exit(1);
});

logger.info({ nodeEnv: config.nodeEnv }, "Starting wildberries-tariff-sync");

const knex = createKnex(config);
const { migrate, seed } = createMigrator(knex, logger);
await migrate.latest();
await seed.run();

const repository = new KnexTariffRepository(knex);
const syncService = new TariffsSyncService({
    source: new WbApiClient({
        baseUrl: config.wb.baseUrl,
        token: config.wb.token,
        timeoutMs: config.wb.timeoutMs,
        retry: { attempts: config.wb.retryAttempts },
        logger: logger.child({ module: "wb-api" }),
    }),
    repository,
    clock: systemClock,
    logger: logger.child({ module: "tariffs-sync" }),
});
const publisher = new GoogleSheetsPublisher({
    createSheetsClient: async () => google.sheets({ version: "v4", auth: await loadGoogleAuth(config.google.credentialsPath) }),
    repository,
    registry: new DbSpreadsheetRegistry(knex, config.sheets.spreadsheetIds, logger.child({ module: "spreadsheet-registry" })),
    config: config.sheets,
    logger: logger.child({ module: "sheets" }),
});

const scheduler = new Scheduler({
    steps: [
        { name: "tariffs_sync", run: () => syncService.sync() },
        { name: "sheets_publish", run: () => publisher.publish() },
    ],
    intervalMs: config.scheduler.intervalMs,
    runOnStart: config.scheduler.runOnStart,
    breakerThreshold: config.scheduler.breakerThreshold,
    breakerResetMs: config.scheduler.breakerResetMs,
    logger: logger.child({ module: "scheduler" }),
});

const healthServer = await startHealthServer({
    port: config.http.port,
    readinessCheck: () => knex.raw("select 1"),
    statusProvider: () => scheduler.getStatus(),
    logger: logger.child({ module: "http" }),
});

scheduler.start();
logger.info("Application started");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    try {
        await scheduler.stop();
        await healthServer.close();
        await knex.destroy();
        process.exit(0);
    } catch (err) {
        logger.fatal({ err }, "Error during shutdown");
        process.exit(1);
    }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
