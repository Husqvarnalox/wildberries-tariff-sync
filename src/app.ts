import knex, { migrate, seed } from "#postgres/knex.js";
import { SchedulerService } from "./services/scheduler.service.js";

console.log("Starting application...");

await migrate.latest();
await seed.run();

console.log("All migrations and seeds have been run");

const scheduler = new SchedulerService();
scheduler.start();

async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received, shutting down...`);
    scheduler.stop();
    await knex.destroy();
    process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log("Application started successfully");
