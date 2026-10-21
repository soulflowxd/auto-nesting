import { beforeAll, describe, expect, it } from "vitest";
import { draw, exportSTEP, makeBaseBox, makeCylinder, makeSphere, type AnyShape } from "replicad";
import { analyzeStep, ensureOpenCascade } from "./analyze-step";

async function stepBytes(shape: AnyShape) {
  const blob = exportSTEP([{ shape, name: "test-part" }]);
  return new Uint8Array(await blob.arrayBuffer());
}

describe("analyzeStep", () => {
  beforeAll(async () => {
    await ensureOpenCascade();
  });

  it("flattens a uniform prismatic solid and reports source thickness", async () => {
    const result = await analyzeStep(await stepBytes(makeBaseBox(50, 25, 3)));
    expect(result.sourceThicknessMm).toBeCloseTo(3, 3);
    const dimensionsMm = [result.boundingBox.width, result.boundingBox.height]
      .map((dimension) => dimension * 25.4)
      .sort((a, b) => a - b);
    expect(dimensionsMm[0]).toBeCloseTo(25, 2);
    expect(dimensionsMm[1]).toBeCloseTo(50, 2);
    expect(result.cutLengthIn * 25.4).toBeCloseTo(150, 2);
    expect(result.closedLoopCount).toBe(1);
  });

  it("rejects a non-prismatic solid", async () => {
    const sphere = makeSphere(10);
    await expect(analyzeStep(await stepBytes(sphere))).rejects.toThrow(/isn’t a flat 2D part/i);
  });

  it("preserves a through-hole when flattening a rotated plate", async () => {
    const shape = makeBaseBox(100, 60, 3).cut(makeCylinder(8, 5, [0, 0, -1])).rotate(37, [0, 0, 0], [1, 0, 0]);
    const result = await analyzeStep(await stepBytes(shape));
    expect(result.closedLoopCount).toBe(2);
    expect(result.sourceThicknessMm).toBeCloseTo(3, 3);
    expect([result.boundingBox.width * 25.4, result.boundingBox.height * 25.4].sort((a, b) => a - b)).toEqual(expect.arrayContaining([expect.closeTo(60, 3), expect.closeTo(100, 3)]));
  });

  it("rejects multiple solid bodies", async () => {
    const blob = exportSTEP([{shape: makeBaseBox(50, 30, 3), name: 'one'}, {shape: makeBaseBox(20, 20, 6).translate([100, 0, 0]), name: 'two'}]);
    await expect(analyzeStep(new Uint8Array(await blob.arrayBuffer()))).rejects.toThrow(/exactly one solid/);
  });

  it("chooses the broad sheet faces when a narrow notch has a smaller opposed-face gap", async () => {
    const notchedPlate = draw([0, 0])
      .lineTo([50, 0])
      .lineTo([50, 25])
      .lineTo([26, 25])
      .lineTo([26, 15])
      .lineTo([25, 15])
      .lineTo([25, 25])
      .lineTo([0, 25])
      .close()
      .sketchOnPlane("XY")
      .extrude(6.35);
    const result = await analyzeStep(await stepBytes(notchedPlate));
    expect(result.sourceThicknessMm).toBeCloseTo(6.35, 3);
    expect(result.cutLengthIn * 25.4).toBeCloseTo(170, 2);
  });
});
