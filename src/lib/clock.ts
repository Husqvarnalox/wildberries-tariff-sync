export interface Clock {
    now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Current UTC calendar date as "YYYY-MM-DD". */
export function todayIsoDate(clock: Clock = systemClock): string {
    return clock.now().toISOString().slice(0, 10);
}
