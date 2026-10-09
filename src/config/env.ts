import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();

const booleanFlag = z.preprocess(
    (value) => {
        if (typeof value !== "string") return value;
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
        return value;
    },
    z.boolean({ invalid_type_error: 'must be "true", "false", "1" or "0"' }),
);

const required = z.string({ required_error: "is required" }).trim().min(1, "is required");

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    POSTGRES_HOST: z.string().trim().min(1).default("localhost"),
    POSTGRES_PORT: port.default(5432),
    POSTGRES_DB: z.string().trim().min(1).default("postgres"),
    POSTGRES_USER: z.string().trim().min(1).default("postgres"),
    POSTGRES_PASSWORD: required,
    WBTOKEN: required,
    WB_API_BASE_URL: z.string().url().default("https://common-api.wildberries.ru"),
    WB_REQUEST_TIMEOUT_MS: positiveInt.default(30_000),
    WB_RETRY_ATTEMPTS: positiveInt.default(3),
    GOOGLE_CREDENTIALS_PATH: required,
    SPREADSHEET_IDS: z
        .string()
        .default("")
        .transform((value) =>
            value
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
        ),
    SHEETS_SHEET_NAME: z.string().trim().min(1).default("stocks_coefs"),
    SHEETS_PUBLISH_SCOPE: z.enum(["latest", "all"]).default("latest"),
    SYNC_INTERVAL_MS: positiveInt.default(3_600_000),
    RUN_ON_START: booleanFlag.default(true),
    CIRCUIT_BREAKER_THRESHOLD: positiveInt.default(5),
    CIRCUIT_BREAKER_RESET_MS: positiveInt.default(3_600_000),
    APP_PORT: port.default(5000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export interface AppConfig {
    nodeEnv: "development" | "production" | "test";
    postgres: { host: string; port: number; database: string; user: string; password: string };
    wb: { token: string; baseUrl: string; timeoutMs: number; retryAttempts: number };
    google: { credentialsPath: string };
    sheets: { spreadsheetIds: string[]; sheetName: string; publishScope: "latest" | "all" };
    scheduler: { intervalMs: number; runOnStart: boolean; breakerThreshold: number; breakerResetMs: number };
    http: { port: number };
    log: { level: string };
}

export class ConfigError extends Error {
    constructor(public readonly problems: string[]) {
        super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
        this.name = "ConfigError";
    }
}

/** Parses and validates environment variables. Throws {@link ConfigError} listing every invalid variable. */
export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
    // Treat empty strings as "unset" so `.env` templates with blank values fall back to defaults.
    const cleaned: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(source)) {
        cleaned[key] = value === "" ? undefined : value;
    }

    const parsed = envSchema.safeParse(cleaned);
    if (!parsed.success) {
        throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`));
    }
    const env = parsed.data;

    return {
        nodeEnv: env.NODE_ENV,
        postgres: { host: env.POSTGRES_HOST, port: env.POSTGRES_PORT, database: env.POSTGRES_DB, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD },
        wb: { token: env.WBTOKEN, baseUrl: env.WB_API_BASE_URL, timeoutMs: env.WB_REQUEST_TIMEOUT_MS, retryAttempts: env.WB_RETRY_ATTEMPTS },
        google: { credentialsPath: env.GOOGLE_CREDENTIALS_PATH },
        sheets: { spreadsheetIds: env.SPREADSHEET_IDS, sheetName: env.SHEETS_SHEET_NAME, publishScope: env.SHEETS_PUBLISH_SCOPE },
        scheduler: {
            intervalMs: env.SYNC_INTERVAL_MS,
            runOnStart: env.RUN_ON_START,
            breakerThreshold: env.CIRCUIT_BREAKER_THRESHOLD,
            breakerResetMs: env.CIRCUIT_BREAKER_RESET_MS,
        },
        http: { port: env.APP_PORT },
        log: { level: env.LOG_LEVEL },
    };
}

/** Loads config or prints a readable message (no stack trace) and exits with code 1. */
export function loadConfigOrExit(source: NodeJS.ProcessEnv): AppConfig {
    try {
        return loadConfig(source);
    } catch (error) {
        if (error instanceof ConfigError) {
            process.stderr.write(`${error.message}\n`);
            process.exit(1);
        }
        throw error;
    }
}
