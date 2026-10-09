import dotenv from "dotenv";
import { Command } from "commander";
import { loadConfigOrExit } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createKnex, createMigrator } from "../postgres/knex.js";

dotenv.config();

const config = loadConfigOrExit(process.env);
const logger = createLogger({ level: config.log.level, pretty: config.nodeEnv !== "production" });
const knex = createKnex(config);
const { migrate, seed } = createMigrator(knex, logger);

async function run(task: () => Promise<void>): Promise<void> {
    let exitCode = 0;
    try {
        await task();
    } catch (err) {
        logger.error({ err }, "Command failed");
        exitCode = 1;
    } finally {
        await knex.destroy();
    }
    process.exit(exitCode);
}

const program = new Command();

program
    .command("migrate")
    .argument("[type]", "latest|rollback|down|up|list|make")
    .argument("[arg]", "version or name")
    .action((action?: string, arg?: string) =>
        run(async () => {
            if (action === "latest") await migrate.latest();
            else if (action === "rollback") await migrate.rollback();
            else if (action === "down") await migrate.down(arg);
            else if (action === "up") await migrate.up(arg);
            else if (action === "list") await migrate.list();
            else if (action === "make") await migrate.make(arg ?? "");
            else if (action) throw new Error(`Unknown migrate action: ${action}`);
        }),
    );

program.command("seed [action] [arg]").action((action?: string, arg?: string) =>
    run(async () => {
        if (action === "run") await seed.run();
        else if (action === "make") await seed.make(arg ?? "");
        else if (action) throw new Error(`Unknown seed action: ${action}`);
    }),
);

program.command("default", { isDefault: true }).action(() => run(async () => {}));
program.parse();
