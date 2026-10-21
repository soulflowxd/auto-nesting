import { describe, expect, it } from "vitest";
import { nestParts, outlinePathData, outlineTransform, placementCentre, type NestOutline, type NestPoint } from "./nesting";

const box = (id: string, widthIn: number, heightIn: number, quantity = 1) => ({
  id,
  label: id,
  widthIn,
  heightIn,
  quantity,
});

describe("nestParts", () => {
  it("packs parts that fit onto one sheet", () => {
    const result = nestParts([box("a", 10, 5, 2)], 24, 12);
    expect(result.sheetsUsed).toBe(1);
    expect(result.placements).toHaveLength(2);
    expect(result.unplaced).toHaveLength(0);
  });

  it("overflows onto a second sheet once the first is full", () => {
    const result = nestParts([box("a", 20, 10, 3)], 24, 12);
    expect(result.sheetsUsed).toBe(3);
  });

  it("rotates a part that only fits sideways", () => {
    const result = nestParts([box("a", 20, 5)], 24, 12);
    expect(result.unplaced).toHaveLength(0);
    expect(result.placements[0].rotationDeg % 180).toBe(0);

    const tall = nestParts([box("a", 5, 20)], 24, 12);
    expect(tall.unplaced).toHaveLength(0);
    expect(tall.placements[0].rotationDeg % 180).toBe(90);
  });

  it("reports a part too large for the sheet in any orientation as unplaced", () => {
    const result = nestParts([box("a", 30, 30)], 24, 12);
    expect(result.placements).toHaveLength(0);
    expect(result.unplaced).toHaveLength(1);
  });

  it("keeps every placement inside the sheet bounds", () => {
    const width = 24;
    const height = 12;
    const result = nestParts([box("a", 6, 4, 5), box("b", 3, 9, 3)], width, height);
    expect(result.placements.length).toBeGreaterThan(0);
    for (const p of result.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(width);
      expect(p.y + p.height).toBeLessThanOrEqual(height);
    }
  });

  it("never overlaps two plain rectangles", () => {
    const result = nestParts([box("a", 5, 3, 6), box("b", 2, 7, 4)], 24, 12);
    expect(result.placements.length).toBeGreaterThan(0);
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        const a = result.placements[i];
        const b = result.placements[j];
        if (a.sheetIndex !== b.sheetIndex) continue;
        // A rectangle has no cutout to nest into and no concavity to tuck
        // under, so its box overlapping another's is always a real collision.
        const disjoint =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(disjoint).toBe(true);
      }
    }
  });
});

describe("true-contour nesting", () => {
  /**
   * An "L": a 10 x 6 block with a 6 x 4 bite out of the top right. Turn one
   * 180° and the pair tiles into a 10 x 8 rectangle, so their bounding boxes
   * must overlap, something a box packer can never do.
   */
  const lShape: NestOutline = [[
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 2 },
    { x: 4, y: 2 },
    { x: 4, y: 6 },
    { x: 0, y: 6 },
  ]];

  /** A 10 x 10 ring with a generous 6 x 6 interior hole. */
  const ring: NestOutline = [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
  ];

  function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  it("tucks a part into another part's concavity", () => {
    // Narrow sheet on purpose: with room to spare side by side, sitting at
    // y = 0 really is the better placement and bottom-left fill takes it.
    // Interlocking is what should happen when that room runs out.
    const result = nestParts(
      [{ id: "l", label: "l", widthIn: 10, heightIn: 6, quantity: 2, outline: lShape }],
      12,
      14);
    expect(result.placements).toHaveLength(2);
    const [first, second] = result.placements;
    expect(first.sheetIndex).toBe(second.sheetIndex);
    // The payoff: bounding boxes now interpenetrate, which is exactly what
    // the old shelf packer could not do.
    expect(boxesOverlap(first, second)).toBe(true);
  });

  it("nests a small part inside a large part's cutout", () => {
    const result = nestParts(
      [
        { id: "ring", label: "ring", widthIn: 10, heightIn: 10, quantity: 1, outline: ring },
        { id: "peg", label: "peg", widthIn: 3, heightIn: 3, quantity: 1 },
      ],
      11,
      11);
    // Only the ring fits an 11 x 11 sheet on its own, so the peg landing on
    // the same sheet can only mean it went into the 6 x 6 cutout.
    expect(result.unplaced).toHaveLength(0);
    const outer = result.placements.find((p) => p.partId === "ring")!;
    const peg = result.placements.find((p) => p.partId === "peg")!;
    expect(peg.sheetIndex).toBe(outer.sheetIndex);
    expect(peg.x).toBeGreaterThan(outer.x);
    expect(peg.x + peg.width).toBeLessThan(outer.x + outer.width);
    expect(peg.y).toBeGreaterThan(outer.y);
    expect(peg.y + peg.height).toBeLessThan(outer.y + outer.height);
  });

  it("will not nest a part too big for the cutout, however much it dodges the material", () => {
    /*
     * The peg's footprint fits between the ring's walls but not inside the
     * cutout with clearance. Under a collision test it would slip in, because
     * it can be positioned to miss the metal. Containment is what rejects it.
     */
    const result = nestParts(
      [
        { id: "ring", label: "ring", widthIn: 10, heightIn: 10, quantity: 1, outline: ring },
        { id: "slab", label: "slab", widthIn: 9, heightIn: 5, quantity: 1 },
      ],
      11,
      11);
    const outer = result.placements.find((p) => p.partId === "ring")!;
    const slab = result.placements.find((p) => p.partId === "slab");
    expect(slab === undefined || slab.sheetIndex !== outer.sheetIndex).toBe(true);
  });

  it("nests contoured parts onto fewer sheets than their bounding boxes need", () => {
    const contoured = nestParts(
      [{ id: "l", label: "l", widthIn: 10, heightIn: 6, quantity: 6, outline: lShape }],
      24,
      12);
    const boxes = nestParts([box("u", 10, 6, 6)], 24, 12);
    expect(contoured.unplaced).toHaveLength(0);
    expect(contoured.sheetsUsed).toBeLessThan(boxes.sheetsUsed);
  });

  it("rotates the stored outline so the view never repeats the rotation", () => {
    const result = nestParts(
      [{ id: "l", label: "l", widthIn: 10, heightIn: 6, quantity: 2, outline: lShape }],
      24,
      12);
    for (const placement of result.placements) {
      const points = placement.outline.flat();
      const width = Math.max(...points.map((p) => p.x));
      const height = Math.max(...points.map((p) => p.y));
      // The outline carries its own rotation, so its extent matches the
      // placement's reported size rather than the part's original one.
      expect(width).toBeCloseTo(placement.width, 6);
      expect(height).toBeCloseTo(placement.height, 6);
      expect(Math.min(...points.map((p) => p.x))).toBe(0);
      expect(Math.min(...points.map((p) => p.y))).toBe(0);
    }
  });

  /** A quarter-disc arm, close enough to the real gear brackets to be useful. */
  function arm(): NestOutline {
    const radius = 12;
    const outer = Array.from({ length: 49 }, (_, i) => {
      const a = (Math.PI / 2) * (i / 48);
      return { x: radius - radius * Math.cos(a), y: radius * Math.sin(a) };
    });
    outer.push({ x: radius, y: radius }, { x: radius, y: 0 });
    const bore = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return { x: 9 + 2 * Math.cos(a), y: 9 + 2 * Math.sin(a) };
    });
    return [outer, bore];
  }

  it("interlocks a pair rather than leaving them side by side", () => {
    const result = nestParts(
      [{ id: "arm", label: "arm", widthIn: 12, heightIn: 12, quantity: 2, outline: arm() }],
      27.5591,
      27.5591);
    const [first, second] = result.placements;
    expect(result.sheetsUsed).toBe(1);
    // Both fit on one sheet either way, so it is the tightness tie-break that
    // has to pick the interlocked layout over the loose one.
    expect(boxesOverlap(first, second)).toBe(true);
  });

  it("stays fast enough to render on a long queue", () => {
    const started = Date.now();
    const result = nestParts(
      [{ id: "arm", label: "arm", widthIn: 12, heightIn: 12, quantity: 150, outline: arm() }],
      27.5591,
      27.5591);
    // Unbounded sheet backtracking made this take 17 seconds, which would
    // have stalled the page render outright.
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.placements).toHaveLength(150);
  });

  it("gives a part with no outline a rectangular one to draw", () => {
    const result = nestParts([box("a", 4, 2)], 24, 12);
    expect(result.placements[0].outline).toHaveLength(1);
    expect(result.placements[0].outline[0]).toHaveLength(4);
  });
});

describe("outline rendering", () => {
  /** Apply an SVG `matrix(a b c d e f)` string the way a renderer would. */
  function applyMatrix(transform: string, point: { x: number; y: number }) {
    const [a, b, c, d, e, f] = transform.slice("matrix(".length, -1).split(" ").map(Number);
    return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
  }

  const SHEET = 20;
  const placement = { x: 3, y: 5, width: 4, height: 2 };

  it("flips about the sheet, not about the part", () => {
    const transform = outlineTransform(placement, SHEET);
    // Part-space origin is the placement's bottom-left corner, which sits
    // 5 up from the sheet's bottom edge, so 15 down from its top.
    expect(applyMatrix(transform, { x: 0, y: 0 })).toEqual({ x: 3, y: 15 });
    expect(applyMatrix(transform, { x: 4, y: 2 })).toEqual({ x: 7, y: 13 });
  });

  it("keeps parts sharing a sheet edge aligned regardless of their heights", () => {
    /*
     * The regression this exists for: flipping by `placement.y + height` put
     * every part at an offset that depended on its own height, so two parts
     * resting on the same sheet edge were drawn aligned by their tops. On a
     * real nest that rendered disjoint parts as overlapping ones.
     */
    const short = { x: 0, y: 5, width: 4, height: 2 };
    const tall = { x: 10, y: 5, width: 4, height: 9 };
    const bottomOf = (p: typeof short) =>
      applyMatrix(outlineTransform(p, SHEET), { x: 0, y: 0 }).y;
    expect(bottomOf(short)).toBe(bottomOf(tall));
  });

  it("preserves handedness so contours are never mirrored", () => {
    const [a, b, c, d] = outlineTransform(placement, SHEET).slice("matrix(".length, -1).split(" ").map(Number);
    // A single y flip and nothing else: exactly one reflection, so the part
    // reads the right way round on a y-down canvas.
    expect(a * d - b * c).toBe(-1);
  });

  it("places a label at the part's centre in sheet coordinates", () => {
    expect(placementCentre(placement, SHEET)).toEqual({ x: 5, y: 14 });
  });

  it("emits one closed subpath per loop so holes render with evenodd", () => {
    const d = outlinePathData([
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
      [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }],
    ]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d.startsWith("M0.0000 0.0000L2.0000 0.0000")).toBe(true);
  });
});


describe("cuttability", () => {
  /**
   * A comb: a 10 x 6 frame with three big rectangular cutouts, leaving thin
   * teeth. Most of its area is hole, like the real brackets, the shape that
   * used to interleave with itself.
   */
  const comb: NestOutline = [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }],
    [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 5 }, { x: 1, y: 5 }],
    [{ x: 4, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 5 }, { x: 4, y: 5 }],
    [{ x: 7, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 5 }, { x: 7, y: 5 }],
  ];

  /** Loops of a placement, translated into sheet coordinates. */
  const loopsOf = (p: { x: number; y: number; outline: NestOutline }) =>
    p.outline.map((loop) => loop.map((pt) => ({ x: p.x + pt.x, y: p.y + pt.y })));

  function segmentsCross(p1: NestPoint, p2: NestPoint, p3: NestPoint, p4: NestPoint) {
    const side = (a: NestPoint, b: NestPoint, c: NestPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = side(p3, p4, p1);
    const d2 = side(p3, p4, p2);
    const d3 = side(p1, p2, p3);
    const d4 = side(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** Even-odd over every loop: true when the point is on metal, not in a cutout. */
  function inMetal(point: NestPoint, loops: NestPoint[][]) {
    let inside = false;
    for (const loop of loops) {
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const straddles = loop[i].y > point.y !== loop[j].y > point.y;
        const at = ((loop[j].x - loop[i].x) * (point.y - loop[i].y)) / (loop[j].y - loop[i].y) + loop[i].x;
        if (straddles && point.x < at) inside = !inside;
      }
    }
    return inside;
  }

  /**
   * The cuttability rule, stated directly: no cut path of one part may cross a
   * cut path of another, and no part may have metal where another has metal.
   * A part sitting cleanly inside a cutout satisfies both.
   */
  function clashes(result: ReturnType<typeof nestParts>) {
    const found: string[] = [];
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        const a = result.placements[i];
        const b = result.placements[j];
        if (a.sheetIndex !== b.sheetIndex) continue;
        const A = loopsOf(a);
        const B = loopsOf(b);
        for (const la of A) {
          for (const lb of B) {
            for (let x = 0; x < la.length; x += 1) {
              for (let y = 0; y < lb.length; y += 1) {
                if (segmentsCross(la[x], la[(x + 1) % la.length], lb[y], lb[(y + 1) % lb.length])) {
                  found.push(`${i}/${j} cut paths cross`);
                }
              }
            }
          }
        }
        // Crossing-free is not enough on its own: one part could sit entirely
        // within another's metal without any boundary meeting.
        if (B.flat().some((pt) => inMetal(pt, A)) || A.flat().some((pt) => inMetal(pt, B))) {
          found.push(`${i}/${j} metal on metal`);
        }
      }
    }
    return [...new Set(found)];
  }

  it("never threads one skeletal part's material through another's cutouts", () => {
    // Collision used to run against the material only. A part that is mostly
    // hole is a thin skeleton, and two skeletons interleave with no cell ever
    // colliding, packed tight on screen, impossible to actually cut.
    for (const quantity of [2, 3, 4, 6]) {
      const result = nestParts(
        [{ id: "comb", label: "comb", widthIn: 10, heightIn: 6, quantity, outline: comb }],
        24,
        24);
      expect(result.placements).toHaveLength(quantity);
      expect(clashes(result)).toEqual([]);
    }
  });

  it("nests small parts into a comb's cutouts without any cut path meeting", () => {
    const result = nestParts(
      [
        { id: "comb", label: "comb", widthIn: 10, heightIn: 6, quantity: 1, outline: comb },
        { id: "chip", label: "chip", widthIn: 1, heightIn: 2, quantity: 3 },
      ],
      11,
      7);
    const combPlacement = result.placements.find((p) => p.partId === "comb")!;
    const chips = result.placements.filter((p) => p.partId === "chip" && p.sheetIndex === combPlacement.sheetIndex);
    // Only the comb fits this sheet on its own, so any chip beside it is in a
    // cutout, and it has to be there legitimately.
    expect(chips.length).toBeGreaterThan(0);
    expect(clashes(result)).toEqual([]);
  });
});

describe("saving sheets", () => {
  const DELRIN = 23.622047;
  const SRPP = 24.015748;

  it("fills the cutouts on early sheets after later sheets are open", () => {
    /*
     * Five frames take a sheet each, and each window holds four of the
     * squares. Looking back over only the last three sheets, as the nester
     * once did, left the first two windows empty and started a sixth sheet
     * for the squares that had nowhere left to go.
     */
    const frame: NestOutline = [
      [{ x: 0, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 22 }, { x: 0, y: 22 }],
      [{ x: 6, y: 6 }, { x: 16, y: 6 }, { x: 16, y: 16 }, { x: 6, y: 16 }],
    ];
    const result = nestParts(
      [{ id: "frame", label: "frame", widthIn: 22, heightIn: 22, quantity: 5, outline: frame }, box("square", 4, 4, 20)],
      DELRIN,
      DELRIN);
    expect(result.unplaced).toHaveLength(0);
    expect(result.sheetsUsed).toBe(5);
    for (let sheet = 0; sheet < 5; sheet += 1) {
      expect(result.placements.filter((p) => p.sheetIndex === sheet && p.partId === "square")).toHaveLength(4);
    }
  });

  it("keeps neighbours exactly the gap apart rather than rounding it out", () => {
    /*
     * Cells sized from the sheet, 220 across, rounded both the gap and each
     * strip's edges outward, so 1-inch strips sat about 0.29 inch apart and
     * 36 filled a sheet. At a third of the gap per cell they sit 0.2 apart,
     * and 38 go on one sheet.
     */
    const result = nestParts([box("strip", 1, 10, 38)], DELRIN, DELRIN);
    expect(result.sheetsUsed).toBe(1);
    const rows = new Map<string, typeof result.placements>();
    for (const p of result.placements) {
      const key = `${p.y.toFixed(3)}:${p.rotationDeg % 180}`;
      rows.set(key, [...(rows.get(key) ?? []), p]);
    }
    const gaps: number[] = [];
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) gaps.push(row[i].x - (row[i - 1].x + row[i - 1].width));
    }
    expect(gaps.length).toBeGreaterThan(30);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(gap).toBeLessThan(0.21);
    }
  });

  it("never needs more sheets than the coarse cells did", () => {
    /*
     * The one order of 105 sizes tried where the fine cells alone needed an
     * extra sheet: 43 L-brackets and 29 U-channels on a 610 mm sheet. Both
     * nests run and the better is kept, so it stays on the coarse nest's two.
     */
    const hole = (cx: number, cy: number): NestPoint[] =>
      Array.from({ length: 12 }, (_, i) => ({ x: cx + 0.1 * Math.cos((i * Math.PI) / 6), y: cy + 0.1 * Math.sin((i * Math.PI) / 6) }));
    const bracket: NestOutline = [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }],
      hole(0.5, 0.5), hole(3.5, 0.5), hole(0.5, 3.5),
    ];
    const channel: NestOutline = [[
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 5 }, { x: 2.25, y: 5 },
      { x: 2.25, y: 0.75 }, { x: 0.75, y: 0.75 }, { x: 0.75, y: 5 }, { x: 0, y: 5 },
    ]];
    const result = nestParts(
      [
        { id: "bracket", label: "bracket", widthIn: 4, heightIn: 4, quantity: 43, outline: bracket },
        { id: "channel", label: "channel", widthIn: 3, heightIn: 5, quantity: 29, outline: channel },
      ],
      SRPP,
      SRPP);
    expect(result.unplaced).toHaveLength(0);
    expect(result.sheetsUsed).toBe(2);
  });
});

describe("long runs", () => {
  it("places every piece of a run longer than one pass, on distinct sheets", () => {
    /*
     * Past the pass size the nester used to drop the rest without a word: no
     * placement and no entry in `unplaced`, so pieces vanished from the page,
     * the sheet DXF and any count of sheets. Every piece must come back, and
     * the sheets opened by a later pass must not reuse an earlier one's ids.
     */
    const result = nestParts([box("washer", 0.5, 0.5, 2100)], 24, 24);
    expect(result.placements).toHaveLength(2100);
    expect(result.unplaced).toHaveLength(0);
    const sheetIds = new Set(result.placements.map((placement) => placement.sheetId));
    const sheetIndexes = new Set(result.placements.map((placement) => placement.sheetIndex));
    expect(sheetIds.size).toBe(sheetIndexes.size);
    expect(Math.max(...sheetIndexes)).toBe(result.sheetsUsed - 1);
  });

  it("carries each piece's order id onto its placement", () => {
    const result = nestParts([{ ...box("a", 2, 2), orderId: "order-1", orderNumber: "1001-10-10" }], 24, 12);
    expect(result.placements[0].orderId).toBe("order-1");
  });
});
