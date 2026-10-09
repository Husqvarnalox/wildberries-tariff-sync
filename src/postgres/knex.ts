import _knex, { type Knex } from "knex";
import type { AppConfig } from "../config/env.js";
import { buildKnexConfig } from "../config/knex/knexfile.js";
import type { Logger } from "../lib/logger.js";

export function createKnex(config: AppConfig): Knex {
    return _knex(buildKnexConfig(config));
}

export function createMigrator(knex: Knex, logger: Logger) {
    const log = logger.child({ module: "migrations" });

    const reportMigrations = (action: "ran" | "rolled back", [batch, names]: [number, string[]]) => {
        if (names.length === 0) {
            log.info(action === "ran" ? "All migrations are up to date" : "Nothing to roll back");
            return;
        }
        log.info({ batch, migrations: names }, `Batch ${action} migrations`);
    };

    const migrate = {
        latest: async () => reportMigrations("ran", await knex.migrate.latest()),
        rollback: async () => reportMigrations("rolled back", await knex.migrate.rollback()),
        down: async (name?: string) => reportMigrations("rolled back", await knex.migrate.down({ name })),
        up: async (name?: string) => reportMigrations("ran", await knex.migrate.up({ name })),
        list: async () => {
            const [completed, pending] = (await knex.migrate.list()) as [{ name: string }[], { file: string }[]];
            log.info({ completed: completed.map((m) => m.name), pending: pending.map((m) => m.file) }, "Migration status");
        },
        make: async (name: string) => {
            if (!name) throw new Error("Please provide a migration name");
            log.info({ file: await knex.migrate.make(name, { extension: "js" }) }, "Created migration");
        },
    };

    const seed = {
        run: async () => {
            const [files] = (await knex.seed.run()) as [string[]];
            log.info({ seeds: files.map((f) => f.split(/[/\\]/).pop()) }, `Ran ${files.length} seed file(s)`);
        },
        make: async (name: string) => {
            if (!name) throw new Error("Please provide a seed name");
            log.info({ file: await knex.seed.make(name) }, "Created seed");
        },
    };

    return { migrate, seed };
}
