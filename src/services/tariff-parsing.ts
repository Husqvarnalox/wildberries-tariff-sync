export function parseNumber(value: unknown): number {
    if (value === undefined || value === null) {
        return 0;
    }
    const trimmed = `${value}`.trim();
    if (trimmed === "-" || trimmed === "") {
        return 0;
    }
    const num = parseFloat(trimmed.replace(",", "."));
    if (isNaN(num)) {
        throw new Error(`Invalid number: ${value}`);
    }
    return num;
}

/** The API reports coefficients in percent (100 -> 1.0); missing or non-positive values fall back to 1.0. */
export function calculateCoefficient(warehouse: { boxDeliveryCoefExpr?: string; boxStorageCoefExpr?: string }): number {
    const raw = warehouse.boxDeliveryCoefExpr ?? warehouse.boxStorageCoefExpr;
    const coef = parseNumber(raw ?? "100") / 100;
    return coef <= 0 ? 1.0 : coef;
}
