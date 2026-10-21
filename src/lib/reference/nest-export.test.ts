import { describe, expect, it } from "vitest";
import { sheetToDxf } from "./nest-export";
import type { NestPlacement } from "./nesting";

/**
 * Pull every POINT entity out of a DXF as {layer, x, y}. Parsed from the group
 * pairs rather than regex-matched against a formatted string, so the assertions
 * below are about the entities in the file and not about their spelling.
 */
function readPoints(dxf: string) {
  const lines = dxf.split("\n");
  const found: { layer: string; x: number; y: number }[] = [];

  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] !== "0" || lines[i + 1] !== "POINT") continue;
    let layer = "";
    let x = NaN;
    let y = NaN;
    // Walk this entity's group pairs until the next entity begins.
    for (let j = i + 2; j + 1 < lines.length && lines[j] !== "0"; j += 2) {
      const value = lines[j + 1];
      if (lines[j] === "8") layer = value;
      if (lines[j] === "10") x = Number(value);
      if (lines[j] === "20") y = Number(value);
    }
    found.push({ layer, x, y });
  }

  return found;
}

/** Layer names declared in the LAYER table, which every entity must reference. */
function readLayerTable(dxf: string) {
  return [...dxf.matchAll(/0\nLAYER\n2\n([^\n]+)\n/g)].map((match) => match[1]);
}

const placement = (x: number, y: number): NestPlacement => ({
  partId: "p",
  label: "p",
  sheetIndex: 0,
  sheetId: "s",
  x,
  y,
  width: 2,
  height: 2,
  rotationDeg: 0,
  outline: [[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]],
});

describe("sheetToDxf sheet datum", () => {
  const sheetWidthIn = 48;
  const sheetHeightIn = 24.5;
  const dxf = sheetToDxf({ placements: [placement(1, 1)], sheetWidthIn, sheetHeightIn });

  it("marks all four corners of the sheet, and only those", () => {
    /*
     * Two opposite corners describe the stock only if you already know the
     * marks are diagonal; four leave nothing to infer when the operator
     * squares the sheet on the bed. They stay POINTs, a POINT has no path,
     * so a cutter handed the whole file cannot follow it and wreck the sheet.
     */
    const points = readPoints(dxf);
    expect(points).toHaveLength(4);

    const corners = points.map((point) => [point.x, point.y]).sort();
    expect(corners).toEqual(
      [
        [0, 0],
        [sheetWidthIn, 0],
        [sheetWidthIn, sheetHeightIn],
        [0, sheetHeightIn],
      ].sort());
  });

  it("keeps every corner on the datum layer so the set can be hidden at once", () => {
    const layers = new Set(readPoints(dxf).map((point) => point.layer));
    expect([...layers]).toEqual(["SHEET-DATUM"]);
  });

  it("declares the datum layer in the LAYER table", () => {
    // An entity on a layer the table never declares is what makes a reader
    // drop it silently, which is exactly the failure this file guards.
    expect(readLayerTable(dxf)).toContain("SHEET-DATUM");
  });

  it("marks a square sheet's corners without collapsing two of them", () => {
    // W === H is where a naive diagonal-only marking looks identical to the
    // four-corner one, so it gets its own case.
    const square = sheetToDxf({ placements: [placement(1, 1)], sheetWidthIn: 12, sheetHeightIn: 12 });
    const corners = readPoints(square).map((point) => [point.x, point.y]).sort();
    expect(corners).toEqual([[0, 0], [12, 0], [12, 12], [0, 12]].sort());
  });

  it("asks the reader to draw those corners visibly", () => {
    // Emitting four POINTs is not enough on its own: at the reader's default
    // $PDMODE of 0 each is a bare single-pixel dot that does not grow when the
    // operator zooms out to frame the whole sheet, which is what "I can't see
    // the corner dots" actually looks like. X marks at a viewport-relative
    // size stay legible at any zoom.
    expect(dxf).toMatch(/\$PDMODE\n70\n3\n/);
    expect(dxf).toMatch(/\$PDSIZE\n40\n-2\.000000\n/);
  });

  it("still draws no cuttable path around the sheet", () => {
    // The corners must never quietly become a rectangle: a closed loop on the
    // sheet edge is the thing that ruins stock.
    expect(dxf).not.toMatch(/VERTEX\n8\nSHEET-DATUM/);
    expect(dxf).not.toMatch(/POLYLINE\n8\nSHEET-DATUM/);
  });
});
