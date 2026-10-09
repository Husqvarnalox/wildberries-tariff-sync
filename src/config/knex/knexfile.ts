import type { Knex } from "knex";
import type { AppConfig } from "../env.js";

/** Builds the knex configuration from validated app config. Production runs compiled JS from dist/. */
export function buildKnexConfig(config: AppConfig): Knex.Config {
    const production = config.nodeEnv === "production";
    return {
        client: "pg",
        connection: {
            host: config.postgres.host,
            port: config.postgres.port,
            database: config.postgres.database,
            user: config.postgres.user,
            password: config.postgres.password,
        },
        pool: { min: 0, max: 10 },
        migrations: {
            stub: production ? "dist/config/knex/migration.stub.js" : "src/config/knex/migration.stub.js",
            directory: production ? "./dist/postgres/migrations" : "./src/postgres/migrations",
            tableName: "migrations",
            extension: "js",
        },
        seeds: {
            stub: "src/config/knex/seed.stub.js",
            directory: production ? "./dist/postgres/seeds" : "./src/postgres/seeds",
            extension: "js",
        },
    };
}
