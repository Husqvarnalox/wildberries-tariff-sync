import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCoefficient, parseNumber } from "./tariff-parsing.js";

test("parseNumber handles decimal commas, dashes and blanks", () => {
    assert.equal(parseNumber("1,5"), 1.5);
    assert.equal(parseNumber("-"), 0);
    assert.equal(parseNumber(" "), 0);
    assert.equal(parseNumber(undefined), 0);
});

test("parseNumber rejects garbage", () => {
    assert.throws(() => parseNumber("abc"), /Invalid number/);
});

test("calculateCoefficient converts percent to a multiplier", () => {
    assert.equal(calculateCoefficient({ boxDeliveryCoefExpr: "150" }), 1.5);
    assert.equal(calculateCoefficient({ boxStorageCoefExpr: "80" }), 0.8);
});

test("calculateCoefficient falls back to 1.0 for missing or non-positive values", () => {
    assert.equal(calculateCoefficient({}), 1.0);
    assert.equal(calculateCoefficient({ boxDeliveryCoefExpr: "-" }), 1.0);
    assert.equal(calculateCoefficient({ boxDeliveryCoefExpr: "0" }), 1.0);
});

test("parseNumber accepts numbers and padded strings", () => {
    assert.equal(parseNumber(12), 12);
    assert.equal(parseNumber("  7,25 "), 7.25);
    assert.equal(parseNumber(null), 0);
});

test("calculateCoefficient prefers the delivery expression over storage", () => {
    assert.equal(calculateCoefficient({ boxDeliveryCoefExpr: "200", boxStorageCoefExpr: "50" }), 2);
});

test("calculateCoefficient propagates unparsable input", () => {
    assert.throws(() => calculateCoefficient({ boxDeliveryCoefExpr: "n/a" }), /Invalid number/);
});
