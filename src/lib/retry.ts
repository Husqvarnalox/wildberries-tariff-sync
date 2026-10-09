export interface RetryOptions {
    /** Total number of attempts including the first one. */
    attempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    shouldRetry?: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
    /** Returns a number in [0, 1); injectable for deterministic tests. */
    random?: () => number;
    onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter: delay = random(0, min(maxDelay, base * 2^(attempt-1))). */
export function computeBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number = Math.random): number {
    const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    return Math.floor(random() * ceiling);
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
    const { attempts, baseDelayMs, maxDelayMs, shouldRetry = () => true, sleep = defaultSleep, random = Math.random, onRetry } = options;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            if (attempt >= attempts || !shouldRetry(error)) throw error;
            const delayMs = computeBackoff(attempt, baseDelayMs, maxDelayMs, random);
            onRetry?.({ attempt, delayMs, error });
            await sleep(delayMs);
        }
    }
}
