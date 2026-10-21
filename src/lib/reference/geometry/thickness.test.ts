import { describe, expect, it } from "vitest";
import { thicknessDelta, thicknessMismatch } from "./thickness";

const inches = (value: number) => value * 25.4;

describe("thicknessMismatch", () => {
  /*
   * These three used to be suppressed by a 12% tolerance, on the theory that
   * the nearest metric sheet was close enough to a nominal imperial thickness.
   * They are the whole point of the warning: we cut metric stock, so a part
   * drawn in imperial arrives a real fraction of a millimetre off.
   */
  it.each([
    ["1/4 in drawn, 6 mm stock", inches(0.25), 6, 0.35],
    ["1/8 in drawn, 3 mm stock", inches(0.125), 3, 0.175],
    ["1/16 in drawn, 1.75 mm stock", inches(0.0625), 1.75, 0.1625],
  ])("warns for %s", (_label, imported, selected, expectedGap) => {
    expect(thicknessMismatch(imported, selected)).toBe(true);
    expect(Math.abs(imported - selected)).toBeCloseTo(expectedGap, 4);
  });

  it("warns when the stock is a different sheet entirely", () => {
    expect(thicknessMismatch(inches(0.25), 3)).toBe(true);
    expect(thicknessMismatch(inches(0.125), 6)).toBe(true);
    expect(thicknessMismatch(6, 1.75)).toBe(true);
  });

  it("stays quiet when the stock actually matches", () => {
    expect(thicknessMismatch(6, 6)).toBe(false);
    expect(thicknessMismatch(3, 3)).toBe(false);
    expect(thicknessMismatch(1.75, 1.75)).toBe(false);
  });

  it("treats sub-10-micron differences as measurement noise, not a mismatch", () => {
    // A STEP analyser can return 5.999997 for a 6 mm plate. That is not a
    // different sheet and must not be reported as one.
    expect(thicknessMismatch(5.999997, 6)).toBe(false);
    expect(thicknessMismatch(6.000003, 6)).toBe(false);
    expect(thicknessMismatch(6.02, 6)).toBe(true);
  });

  it("does not warn when an import has no thickness", () => {
    expect(thicknessMismatch(undefined, 6)).toBe(false);
    expect(thicknessMismatch(null, 6)).toBe(false);
    expect(thicknessMismatch(0, 6)).toBe(false);
    expect(thicknessMismatch(-1, 6)).toBe(false);
  });

  it("does not warn when no stock is selected", () => {
    expect(thicknessMismatch(6.35, 0)).toBe(false);
    expect(thicknessMismatch(6.35, Number.NaN)).toBe(false);
  });
});

describe("thicknessDelta", () => {
  it("reports the imperial cases in the direction the part changes", () => {
    // 1/4 in from 6 mm stock arrives thinner than drawn.
    expect(thicknessDelta(inches(0.25), 6)).toMatchObject({ direction: "thinner" });
    // 1/16 in from 1.75 mm stock arrives thicker than drawn.
    expect(thicknessDelta(inches(0.0625), 1.75)).toMatchObject({ direction: "thicker" });
  });

  it("carries both measurements and the signed difference", () => {
    const delta = thicknessDelta(inches(0.25), 6);
    expect(delta?.importedMm).toBeCloseTo(6.35, 4);
    expect(delta?.selectedMm).toBe(6);
    expect(delta?.differenceMm).toBeCloseTo(-0.35, 4);
  });

  it("is null when there is nothing to report", () => {
    expect(thicknessDelta(6, 6)).toBeNull();
    expect(thicknessDelta(undefined, 6)).toBeNull();
  });
});
