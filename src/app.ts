import knex, { migrate, seed } from "#postgres/knex.js";
import { SchedulerService } from "./services/scheduler.service.js";

console.log("Starting application...");

await migrate.latest();
await seed.run();

console.log("All migrations and seeds have been run");

const scheduler = new SchedulerService();
scheduler.start();

process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    scheduler.stop();
    knex.destroy();
    process.exit(0);
});

process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down gracefully...");
    scheduler.stop();
    knex.destroy();
    process.exit(0);
});

console.log("Application started successfully");