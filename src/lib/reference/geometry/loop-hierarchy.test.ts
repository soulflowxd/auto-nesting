import { describe, expect, it } from "vitest";
import { classifyGeometryLoops, sanitizeLoopPoints } from "./loop-hierarchy";
import type { GeometryLoop, Point2D } from "./types";

function loop(points: Point2D[]): GeometryLoop {
  return { points, perimeterIn: 0 };
}

const square = (min: number, max: number) => loop([
  { x: min, y: min },
  { x: max, y: min },
  { x: max, y: max },
  { x: min, y: max },
]);

describe("classifyGeometryLoops", () => {
  it("classifies holes, islands, and disjoint outer profiles", () => {
    const result = classifyGeometryLoops([square(0, 10), square(2, 8), square(4, 6), square(20, 24)]);
    expect(result).toEqual([
      { index: 0, depth: 0, parentIndex: undefined },
      { index: 1, depth: 1, parentIndex: 0 },
      { index: 2, depth: 2, parentIndex: 1 },
      { index: 3, depth: 0, parentIndex: undefined },
    ]);
  });
});

describe("sanitizeLoopPoints", () => {
  it("removes repeated consecutive and closing points", () => {
    expect(sanitizeLoopPoints([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});
