import type { Logger } from "../lib/logger.js";
import { withRetry } from "../lib/retry.js";
import { wbTariffsResponseSchema, type WbTariffsResponse } from "./wb-tariffs.schema.js";

export interface TariffsSource {
    fetchBoxTariffs(date: string): Promise<WbTariffsResponse>;
}

export class WbApiError extends Error {
    constructor(
        message: string,
        public readonly retryable: boolean,
        public readonly status?: number,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = "WbApiError";
    }
}

export interface WbApiClientOptions {
    baseUrl: string;
    token: string;
    timeoutMs: number;
    retry: { attempts: number; baseDelayMs?: number; maxDelayMs?: number };
    logger: Logger;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
}

export class WbApiClient implements TariffsSource {
    private readonly fetchImpl: typeof fetch;

    constructor(private readonly options: WbApiClientOptions) {
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    }

    async fetchBoxTariffs(date: string): Promise<WbTariffsResponse> {
        const { retry, logger, sleep, random } = this.options;
        return withRetry(() => this.fetchOnce(date), {
            attempts: retry.attempts,
            baseDelayMs: retry.baseDelayMs ?? 1000,
            maxDelayMs: retry.maxDelayMs ?? 10_000,
            shouldRetry: (error) => error instanceof WbApiError && error.retryable,
            sleep,
            random,
            onRetry: ({ attempt, delayMs, error }) =>
                logger.warn(
                    { attempt, delayMs, status: error instanceof WbApiError ? error.status : undefined, err: error },
                    "WB API request failed, retrying",
                ),
        });
    }

    private async fetchOnce(date: string): Promise<WbTariffsResponse> {
        const { baseUrl, token, timeoutMs } = this.options;
        const url = new URL("/api/v1/tariffs/box", baseUrl);
        url.searchParams.set("date", date);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let response: Response;
            try {
                response = await this.fetchImpl(url, { headers: { Authorization: token }, signal: controller.signal });
            } catch (cause) {
                const aborted = controller.signal.aborted;
                throw new WbApiError(aborted ? `WB API request timed out after ${timeoutMs}ms` : "WB API network error", true, undefined, { cause });
            }

            if (!response.ok) {
                const retryable = response.status >= 500 || response.status === 429;
                throw new WbApiError(`WB API responded with ${response.status} ${response.statusText}`.trim(), retryable, response.status);
            }

            let body: unknown;
            try {
                body = await response.json();
            } catch (cause) {
                throw new WbApiError("WB API returned a non-JSON body", false, response.status, { cause });
            }

            const parsed = wbTariffsResponseSchema.safeParse(body);
            if (!parsed.success) {
                const summary = parsed.error.issues
                    .slice(0, 5)
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join("; ");
                throw new WbApiError(`WB API response failed schema validation: ${summary}`, false, response.status);
            }
            return parsed.data;
        } finally {
            clearTimeout(timer);
        }
    }
}
