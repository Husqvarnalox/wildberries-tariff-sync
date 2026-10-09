// Runs unit or integration tests through tsx. Usage: node scripts/run-tests.mjs <unit|integration>
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2];
if (mode !== "unit" && mode !== "integration") {
    console.error("Usage: node scripts/run-tests.mjs <unit|integration>");
    process.exit(2);
}

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });
}

const files = walk("src")
    .filter((file) => file.endsWith(".test.ts"))
    .filter((file) => file.endsWith(".integration.test.ts") === (mode === "integration"))
    .sort();

if (files.length === 0) {
    console.error(`No ${mode} test files found`);
    process.exit(1);
}

const tsxBin = join("node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const result = spawnSync(tsxBin, ["--test", ...files], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
