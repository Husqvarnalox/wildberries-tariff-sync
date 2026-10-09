import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadConfig } from "./env.js";

const minimal = { POSTGRES_PASSWORD: "pw", WBTOKEN: "tok", GOOGLE_CREDENTIALS_PATH: "/creds.json" };

test("applies defaults for optional variables", () => {
    const config = loadConfig(minimal);
    assert.equal(config.nodeEnv, "development");
    assert.deepEqual(config.postgres, { host: "localhost", port: 5432, database: "postgres", user: "postgres", password: "pw" });
    assert.equal(config.wb.baseUrl, "https://common-api.wildberries.ru");
    assert.equal(config.wb.timeoutMs, 30_000);
    assert.equal(config.wb.retryAttempts, 3);
    assert.deepEqual(config.sheets, { spreadsheetIds: [], sheetName: "stocks_coefs", publishScope: "latest" });
    assert.deepEqual(config.scheduler, { intervalMs: 3_600_000, runOnStart: true, breakerThreshold: 5, breakerResetMs: 3_600_000 });
    assert.equal(config.http.port, 5000);
    assert.equal(config.log.level, "info");
});

test("splits, trims and filters SPREADSHEET_IDS", () => {
    assert.deepEqual(loadConfig({ ...minimal, SPREADSHEET_IDS: " a, b ,, c ," }).sheets.spreadsheetIds, ["a", "b", "c"]);
    assert.deepEqual(loadConfig({ ...minimal, SPREADSHEET_IDS: "" }).sheets.spreadsheetIds, []);
});

test("coerces numbers and parses booleans", () => {
    const config = loadConfig({ ...minimal, POSTGRES_PORT: "6543", APP_PORT: "8080", RUN_ON_START: "false", SYNC_INTERVAL_MS: "1000" });
    assert.equal(config.postgres.port, 6543);
    assert.equal(config.http.port, 8080);
    assert.equal(config.scheduler.runOnStart, false);
    assert.equal(config.scheduler.intervalMs, 1000);
    assert.equal(loadConfig({ ...minimal, RUN_ON_START: "0" }).scheduler.runOnStart, false);
    assert.equal(loadConfig({ ...minimal, RUN_ON_START: "1" }).scheduler.runOnStart, true);
});

test("treats empty strings as unset", () => {
    const config = loadConfig({ ...minimal, POSTGRES_HOST: "", APP_PORT: "" });
    assert.equal(config.postgres.host, "localhost");
    assert.equal(config.http.port, 5000);
});

test("fails listing every invalid or missing variable", () => {
    assert.throws(
        () => loadConfig({ APP_PORT: "abc", RUN_ON_START: "maybe", SHEETS_PUBLISH_SCOPE: "some" }),
        (err: unknown) => {
            assert.ok(err instanceof ConfigError);
            for (const name of ["POSTGRES_PASSWORD", "WBTOKEN", "GOOGLE_CREDENTIALS_PATH", "APP_PORT", "RUN_ON_START", "SHEETS_PUBLISH_SCOPE"]) {
                assert.ok(err.message.includes(name), `message should mention ${name}`);
            }
            return true;
        },
    );
});

test("the error message never contains secret values", () => {
    assert.throws(
        () => loadConfig({ ...minimal, WBTOKEN: "super-secret-token", APP_PORT: "bad" }),
        (err: unknown) => err instanceof ConfigError && !err.message.includes("super-secret-token"),
    );
});
