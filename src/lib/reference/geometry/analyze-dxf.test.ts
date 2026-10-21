import { describe, expect, it } from "vitest";
import { analyzeDxf, analyzeDxfPreview } from "./analyze-dxf";
import { GeometryError } from "./errors";

function dxf(entities: string, insUnits = 1) {
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${insUnits}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

const rectangle = [
  [0, 0, 2, 0],
  [2, 0, 2, 1],
  [2, 1, 0, 1],
  [0, 1, 0, 0],
]
  .map(([x1, y1, x2, y2]) => `0\nLINE\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`)
  .join("");

describe("analyzeDxf", () => {
  it("stitches line entities into one closed loop", () => {
    const result = analyzeDxf(dxf(rectangle));
    expect(result.closedLoopCount).toBe(1);
    expect(result.boundingBox.width).toBeCloseTo(2, 8);
    expect(result.boundingBox.height).toBeCloseTo(1, 8);
    expect(result.cutLengthIn).toBeCloseTo(6, 8);
  });

  it("counts an internal circular cutout as a second loop", () => {
    const circle = "0\nCIRCLE\n10\n1\n20\n0.5\n30\n0\n40\n0.25\n";
    const result = analyzeDxf(dxf(rectangle + circle));
    expect(result.closedLoopCount).toBe(2);
    expect(result.cutLengthIn).toBeCloseTo(6 + Math.PI * 0.5, 8);
  });

  it("normalizes millimeters to inches", () => {
    const squareMm = `0\nLWPOLYLINE\n70\n1\n90\n4\n10\n0\n20\n0\n10\n25.4\n20\n0\n10\n25.4\n20\n25.4\n10\n0\n20\n25.4\n`;
    const result = analyzeDxf(dxf(squareMm, 4));
    expect(result.boundingBox.width).toBeCloseTo(1, 8);
    expect(result.boundingBox.height).toBeCloseTo(1, 8);
    expect(result.cutLengthIn).toBeCloseTo(4, 8);
  });

  it("requires a unit choice for unitless drawings", () => {
    expect(() => analyzeDxf(dxf(rectangle, 0))).toThrowError(GeometryError);
    expect(analyzeDxf(dxf(rectangle, 0), "mm").sourceUnit).toBe("mm");
  });

  it("previews a unitless drawing without accepting a final unit", () => {
    const preview = analyzeDxfPreview(dxf(rectangle, 0));
    expect(preview.detectedUnit).toBe("unspecified");
    expect(preview.analysis.sourceUnit).toBe("mm");
    expect(preview.analysis.closedLoopCount).toBe(1);
  });

  it("rejects open geometry", () => {
    const oneLine = "0\nLINE\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n";
    expect(() => analyzeDxf(dxf(oneLine))).toThrowError(/open geometry/i);
  });

  it("uses exact bulge arc length for lightweight polylines", () => {
    const semicircle = `0\nLWPOLYLINE\n70\n1\n90\n2\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n`;
    const result = analyzeDxf(dxf(semicircle));
    expect(result.cutLengthIn).toBeCloseTo(Math.PI + 2, 8);
  });
});
