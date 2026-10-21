import { describe, expect, it } from "vitest";
import { analyzeDxf } from "./geometry/analyze-dxf";
import { simplifyLoop, writeDxf, type DxfPoint } from "./dxf-writer";
import { sheetToDxf, nestFileName, SIMPLIFY_TOLERANCE_IN } from "./nest-export";
import { nestParts, type NestOutline } from "./nesting";

const square = (x: number, y: number, size: number): DxfPoint[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

describe("simplifyLoop", () => {
  it("drops points that sit on a straight run", () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.1, y: 0 }));
    expect(simplifyLoop(line, 0.001)).toHaveLength(2);
  });

  it("keeps every corner of a shape that has no redundant points", () => {
    expect(simplifyLoop(square(0, 0, 5), 0.001)).toHaveLength(4);
  });

  it("never moves the path further than the tolerance", () => {
    // A finely sampled arc: the case that actually motivates simplifying.
    const arc = Array.from({ length: 400 }, (_, i) => {
      const a = (Math.PI / 2) * (i / 399);
      return { x: 5 * Math.cos(a), y: 5 * Math.sin(a) };
    });
    const tolerance = 0.001;
    const simplified = simplifyLoop(arc, tolerance);
    expect(simplified.length).toBeLessThan(arc.length / 4);

    // Every original point must still lie within tolerance of the kept path.
    for (const point of arc) {
      let best = Infinity;
      for (let i = 0; i + 1 < simplified.length; i += 1) {
        const a = simplified[i];
        const b = simplified[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
        best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
      }
      expect(best).toBeLessThanOrEqual(tolerance + 1e-9);
    }
  });

  it("leaves a loop alone when asked for no tolerance", () => {
    const arc = Array.from({ length: 20 }, (_, i) => ({ x: i, y: Math.sin(i) }));
    expect(simplifyLoop(arc, 0)).toHaveLength(20);
  });
});

describe("writeDxf", () => {
  const doc = {
    polylines: [{ points: square(1, 2, 3), layer: "CUT", closed: true }],
    layers: [{ name: "CUT", color: 7 }],
    extents: { minX: 0, minY: 0, maxX: 24, maxY: 12 },
  };

  it("declares inches so an importer cannot guess the scale wrong", () => {
    const dxf = writeDxf(doc);
    expect(dxf).toContain("$INSUNITS");
    // Group code 70 carrying 1 = inches, on the line after the variable name.
    expect(dxf).toMatch(/\$INSUNITS\n70\n1\n/);
  });

  it("tells a reader to draw points as marks that survive zooming out", () => {
    /*
     * Without these a reader defaults $PDMODE to 0: a bare single-pixel dot,
     * invisible against a busy nest and not scaled with zoom, so the sheet
     * corners disappear at exactly the zoom the operator uses to see the
     * whole sheet. 3 is an X, and a negative $PDSIZE is a percentage of
     * viewport rather than an absolute size.
     */
    const dxf = writeDxf(doc);
    expect(dxf).toMatch(/\$PDMODE\n70\n3\n/);
    expect(dxf).toMatch(/\$PDSIZE\n40\n-2\.000000\n/);
  });

  it("writes a closed polyline with one vertex per point", () => {
    const dxf = writeDxf(doc);
    expect(dxf.match(/^VERTEX$/gm)).toHaveLength(4);
    expect(dxf).toMatch(/POLYLINE\n8\nCUT\n62\n7\n66\n1\n70\n1\n/);
    expect(dxf).toContain("SEQEND");
  });

  it("round-trips through the app's own DXF parser", () => {
    // The parser this app already trusts for customer uploads is the strictest
    // reader on hand, so writing something it cannot read would be a red flag.
    const analysis = analyzeDxf(writeDxf(doc));
    expect(analysis.closedLoopCount).toBe(1);
    expect(analysis.boundingBox.width).toBeCloseTo(3, 6);
    expect(analysis.boundingBox.height).toBeCloseTo(3, 6);
    expect(analysis.boundingBox.minX).toBeCloseTo(1, 6);
    expect(analysis.boundingBox.minY).toBeCloseTo(2, 6);
  });
});

describe("sheetToDxf", () => {
  /** A ring, so the export has an interior loop to carry through. */
  const ring: NestOutline = [
    [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }],
    [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }],
  ];

  const nest = nestParts([{ id: "r", label: "r", widthIn: 6, heightIn: 6, quantity: 2, outline: ring }], 24, 12);
  const dxf = sheetToDxf({ placements: nest.placements, sheetWidthIn: 24, sheetHeightIn: 12 });

  it("emits every loop of every part and nothing else closed", () => {
    const analysis = analyzeDxf(dxf);
    // 2 parts x (outer + cutout). Critically NOT +1 for a sheet border.
    expect(analysis.closedLoopCount).toBe(nest.placements.length * 2);
  });

  it("never draws the sheet as a cuttable path", () => {
    /*
     * The whole point of the datum points. A rectangle round the sheet is a
     * closed path, and a cutter handed the file will cut it, wrecking the
     * stock. Nothing in the file may trace the sheet outline.
     */
    const analysis = analyzeDxf(dxf);
    expect(analysis.boundingBox.width).toBeLessThan(24);
    expect(analysis.boundingBox.height).toBeLessThan(12);
    // No polyline may run along the sheet edge either.
    expect(dxf).not.toMatch(/VERTEX\n8\n[^\n]*\n10\n24\.000000\n20\n12\.000000/);
  });

  it("marks the sheet with a point at each of its four corners instead", () => {
    // Every corner of the stock, so squaring the sheet on the bed is
    // unambiguous, with no path for the machine to follow.
    expect(dxf.match(/^POINT$/gm)).toHaveLength(4);
    expect(dxf).toMatch(/POINT\n8\nSHEET-DATUM\n62\n8\n10\n0\.000000\n20\n0\.000000\n/);
    expect(dxf).toMatch(/POINT\n8\nSHEET-DATUM\n62\n8\n10\n24\.000000\n20\n0\.000000\n/);
    expect(dxf).toMatch(/POINT\n8\nSHEET-DATUM\n62\n8\n10\n24\.000000\n20\n12\.000000\n/);
    expect(dxf).toMatch(/POINT\n8\nSHEET-DATUM\n62\n8\n10\n0\.000000\n20\n12\.000000\n/);
  });

  it("puts each order on its own pair of layers so a job can be cut alone", () => {
    const twoJobs = nestParts(
      [
        { id: "a", label: "a", widthIn: 4, heightIn: 4, quantity: 1, orderNumber: "ORD-1", outline: ring },
        { id: "b", label: "b", widthIn: 4, heightIn: 4, quantity: 1, orderNumber: "ORD-2", outline: ring },
      ],
      24,
      12,
    );
    const out = sheetToDxf({ placements: twoJobs.placements, sheetWidthIn: 24, sheetHeightIn: 12 });
    for (const layer of ["CUT-ORD-1-OUTSIDE", "CUT-ORD-1-HOLES", "CUT-ORD-2-OUTSIDE", "CUT-ORD-2-HOLES"]) {
      expect(out).toContain(`LAYER\n2\n${layer}\n`);
    }
  });

  it("colors every outside edge blue and every hole red, whatever the order", () => {
    /*
     * The operators set the kerf offset by color: outward on outside edges,
     * inward on holes. One color per kind of edge, the same on every job, is
     * what lets that offset be set once.
     */
    const colorOf = (layer: string) => dxf.match(new RegExp(`LAYER\n2\n${layer}\n70\n0\n62\n(\\d+)`))?.[1];
    expect(colorOf("CUT-OUTSIDE")).toBe("5");
    expect(colorOf("CUT-HOLES")).toBe("1");
    // Each ring's outer loop is an outside edge and its inner loop a hole.
    expect(dxf.match(/POLYLINE\n8\nCUT-OUTSIDE\n/g)).toHaveLength(nest.placements.length);
    expect(dxf.match(/POLYLINE\n8\nCUT-HOLES\n/g)).toHaveLength(nest.placements.length);
  });

  it("keeps a part nested inside another part's cutout an outside edge", () => {
    /*
     * Classified per part, never across the sheet: a small square sitting in a
     * big ring's hole is inside that hole, but it is a part of its own, and
     * its edge is cut as an outside edge.
     */
    const bigRing: NestOutline = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
    ];
    const square: NestOutline = [[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]];
    const out = sheetToDxf({
      placements: [
        { partId: "ring", label: "ring", sheetIndex: 0, sheetId: "s", x: 1, y: 1, width: 10, height: 10, rotationDeg: 0, outline: bigRing },
        { partId: "sq", label: "sq", sheetIndex: 0, sheetId: "s", x: 5, y: 5, width: 2, height: 2, rotationDeg: 0, outline: square },
      ],
      sheetWidthIn: 24,
      sheetHeightIn: 12,
    });
    expect(out.match(/POLYLINE\n8\nCUT-OUTSIDE\n/g)).toHaveLength(2);
    expect(out.match(/POLYLINE\n8\nCUT-HOLES\n/g)).toHaveLength(1);
  });

  it("falls back to one pair of cut layers when a part has no order", () => {
    expect(dxf).toContain("CUT-OUTSIDE");
  });

  it("puts each part where the nester placed it", () => {
    // Reading back a specific vertex proves the translate, not just the count.
    const first = nest.placements[0];
    const expectedX = (first.x + 6).toFixed(6);
    const expectedY = (first.y + 6).toFixed(6);
    expect(dxf).toContain(`10\n${expectedX}\n20\n${expectedY}\n`);
  });

  it("simplifies at a tolerance far below anything a cutter resolves", () => {
    // 0.001in is about a tenth of a typical kerf; if this ever grows into
    // tolerance territory the nest stops being trustworthy.
    expect(SIMPLIFY_TOLERANCE_IN).toBeLessThanOrEqual(0.001);
  });
});

describe("nestFileName", () => {
  it("names a file a shop can read off a job sheet", () => {
    expect(nestFileName("Aluminum 7075", 3, 0)).toBe("nest-aluminum-7075-3mm-sheet-1.dxf");
    expect(nestFileName("Foam-core SRPP", 6, 2)).toBe("nest-foam-core-srpp-6mm-sheet-3.dxf");
  });

  it("survives a material name with punctuation", () => {
    expect(nestFileName("Delrin (Acetal)", 1.75, 0)).toBe("nest-delrin-acetal-1-75mm-sheet-1.dxf");
  });
});
