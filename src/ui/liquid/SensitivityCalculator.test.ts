import { describe, expect, it } from "vitest";
import { matchSensitivity } from "./SensitivityCalculator";

describe("sensitivity matching", () => {
  it("preserves DPI × sensitivity when raising or lowering DPI", () => {
    expect(matchSensitivity(800, 1.5, 1600)).toBe(0.75);
    expect(matchSensitivity(1600, 0.75, 400)).toBe(3);
    expect(matchSensitivity(800, 1.5, 800)).toBe(1.5);
  });
  it("handles fractional sensitivity without integer rounding", () => {
    expect(matchSensitivity(800, 0.275, 3200)).toBeCloseTo(0.06875, 10);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid inputs: %s", (value) => {
    expect(matchSensitivity(value, 1, 800)).toBeNull();
    expect(matchSensitivity(800, value, 1600)).toBeNull();
    expect(matchSensitivity(800, 1, value)).toBeNull();
  });
  it("rejects numeric overflow", () => {
    expect(matchSensitivity(Number.MAX_VALUE, Number.MAX_VALUE, 1)).toBeNull();
  });
});
