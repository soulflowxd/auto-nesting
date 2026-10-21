import type { GeometryLoop, Point2D } from "./types";

export type ClassifiedLoop = {
  index: number;
  depth: number;
  parentIndex?: number;
};

const EPSILON = 1e-9;

export function classifyGeometryLoops(loops: readonly { readonly points: readonly Point2D[] }[]): ClassifiedLoop[] {
  const areas = loops.map((loop) => Math.abs(polygonArea(loop.points)));

  return loops.map((loop, index) => {
    const sample = loop.points[0];
    const containers = loops
      .map((candidate, candidateIndex) => ({ candidateIndex, candidate }))
      .filter(({ candidateIndex, candidate }) =>
        candidateIndex !== index && sample && pointInPolygon(sample, candidate.points),
      )
      .sort((a, b) => areas[a.candidateIndex] - areas[b.candidateIndex]);

    return {
      index,
      depth: containers.length,
      parentIndex: containers[0]?.candidateIndex,
    };
  });
}

/**
 * Area of stock actually left in the part: outer boundaries minus the holes
 * cut out of them, following the same even-odd nesting rule as the depth
 * classification above.
 *
 * Bounding-box area would do for pricing, where overestimating a skeletonised
 * bracket only pads the quote. Shipping is different -- the customer pays the
 * carrier for weight, so a part that is mostly holes must not be rated as a
 * solid plate.
 */
export function netEnclosedAreaIn2(loops: GeometryLoop[]) {
  return classifyGeometryLoops(loops).reduce((total, { index, depth }) => {
    const area = Math.abs(polygonArea(loops[index].points));
    return depth % 2 === 0 ? total + area : total - area;
  }, 0);
}

export function sanitizeLoopPoints(points: Point2D[]): Point2D[] {
  const clean: Point2D[] = [];
  for (const point of points) {
    const previous = clean.at(-1);
    if (!previous || Math.abs(previous.x - point.x) > EPSILON || Math.abs(previous.y - point.y) > EPSILON) {
      clean.push(point);
    }
  }
  if (clean.length > 1) {
    const first = clean[0];
    const last = clean.at(-1)!;
    if (Math.abs(first.x - last.x) <= EPSILON && Math.abs(first.y - last.y) <= EPSILON) clean.pop();
  }
  return clean;
}

function polygonArea(points: readonly Point2D[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function pointInPolygon(point: Point2D, polygon: readonly Point2D[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
