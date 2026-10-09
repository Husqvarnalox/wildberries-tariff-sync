import { createRequire } from "node:module";
import pino, { type Logger } from "pino";

export type { Logger };

export interface LoggerOptions {
    level: string;
    /** Human-readable output. Only honoured outside production and when pino-pretty is installed. */
    pretty?: boolean;
}

function canResolvePretty(): boolean {
    try {
        createRequire(import.meta.url).resolve("pino-pretty");
        return true;
    } catch {
        return false;
    }
}

export function createLogger({ level, pretty }: LoggerOptions): Logger {
    const usePretty = Boolean(pretty) && process.env.NODE_ENV !== "production" && canResolvePretty();
    return pino({
        level,
        redact: {
            paths: ["token", "*.token", "password", "*.password", "authorization", "*.authorization", "private_key", "*.private_key"],
            censor: "[redacted]",
        },
        ...(usePretty ? { transport: { target: "pino-pretty" } } : {}),
    });
}

/** A logger that discards everything; handy for tests. */
export function createSilentLogger(): Logger {
    return pino({ level: "silent" });
}
