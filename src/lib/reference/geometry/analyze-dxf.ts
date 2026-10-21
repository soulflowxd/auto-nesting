import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
  type ISplineEntity,
} from "dxf-parser";
import { GeometryError } from "./errors";
import type { GeometryAnalysis, GeometryLoop, Point2D, UnitOverride } from "./types";

const SUPPORTED_ENTITY_TYPES = new Set(["LINE", "ARC", "CIRCLE", "LWPOLYLINE", "POLYLINE", "SPLINE"]);
/**
 * Entities with no cut path at all. Skipped silently rather than rejected:
 * they carry no geometry to lose, and refusing a drawing over a construction
 * marker turns a perfectly cuttable file into a failed upload. Our own nest
 * exports use POINT to mark sheet corners, so this is also what lets an
 * exported nest be read back in.
 */
const IGNORED_ENTITY_TYPES = new Set(["POINT"]);
const CLOSED_TOLERANCE_IN = 0.0001;
const CURVE_STEP_RADIANS = Math.PI / 90;

type UnitInfo = {
  unit: GeometryAnalysis["sourceUnit"];
  inchesPerUnit: number;
};

type Vertex = IPoint & { bulge?: number };
type Path = {
  points: Point2D[];
  lengthIn: number;
  closed: boolean;
};

const DXF_UNITS: Record<number, UnitInfo> = {
  1: { unit: "in", inchesPerUnit: 1 },
  2: { unit: "ft", inchesPerUnit: 12 },
  4: { unit: "mm", inchesPerUnit: 1 / 25.4 },
  5: { unit: "cm", inchesPerUnit: 1 / 2.54 },
  6: { unit: "m", inchesPerUnit: 1 / 0.0254 },
};

function resolveUnit(insUnits: unknown, override?: UnitOverride): UnitInfo {
  const code = typeof insUnits === "number" ? insUnits : Number(insUnits ?? 0);
  if (!code) {
    if (override === "in") return DXF_UNITS[1];
    if (override === "mm") return DXF_UNITS[4];
    throw new GeometryError(
      "UNIT_REQUIRED",
      "This DXF does not declare its drawing units. Choose inches or millimeters and try again.",
    );
  }

  const unit = DXF_UNITS[code];
  if (!unit) {
    throw new GeometryError(
      "UNSUPPORTED_UNIT",
      `This DXF uses an unsupported unit code (${code}). Export it in inches or millimeters and try again.`,
      { insUnits: code },
    );
  }
  return unit;
}

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointsMatch(a: Point2D, b: Point2D) {
  return distance(a, b) <= CLOSED_TOLERANCE_IN;
}

function pointInInches(point: Pick<IPoint, "x" | "y">, inchesPerUnit: number): Point2D {
  return { x: point.x * inchesPerUnit, y: point.y * inchesPerUnit };
}

function polylineLength(points: Point2D[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function normalizeSweep(start: number, end: number) {
  let sweep = end - start;
  while (sweep < 0) sweep += Math.PI * 2;
  if (sweep < 1e-12) return Math.PI * 2;
  return sweep;
}

function sampleArc(center: Point2D, radius: number, startAngle: number, sweep: number) {
  const count = Math.max(2, Math.ceil(Math.abs(sweep) / CURVE_STEP_RADIANS));
  const offsets = new Set<number>();
  for (let index = 0; index <= count; index += 1) {
    offsets.add((sweep * index) / count);
  }

  for (const cardinal of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const relative = sweep >= 0
      ? ((cardinal - startAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
      : -(((startAngle - cardinal) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
    if (Math.abs(relative) <= Math.abs(sweep) + 1e-12) offsets.add(relative);
  }

  return [...offsets]
    .sort((a, b) => (sweep >= 0 ? a - b : b - a))
    .map((offset) => {
      const angle = startAngle + offset;
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    });
}

function bulgeArc(from: Point2D, to: Point2D, bulge: number) {
  const chord = distance(from, to);
  const sweep = 4 * Math.atan(bulge);
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const leftNormal = { x: -(to.y - from.y) / chord, y: (to.x - from.x) / chord };
  const centerOffset = chord / (2 * Math.tan(sweep / 2));
  const center = {
    x: midpoint.x + leftNormal.x * centerOffset,
    y: midpoint.y + leftNormal.y * centerOffset,
  };
  const radius = distance(center, from);
  const startAngle = Math.atan2(from.y - center.y, from.x - center.x);
  return {
    points: sampleArc(center, radius, startAngle, sweep),
    length: Math.abs(radius * sweep),
  };
}

function polylinePath(vertices: Vertex[], closed: boolean, inchesPerUnit: number): Path {
  if (vertices.length < 2) {
    throw new GeometryError("NO_CUT_GEOMETRY", "A polyline contains fewer than two vertices.");
  }
  const source = closed ? vertices.concat(vertices[0]) : vertices;
  const points: Point2D[] = [];
  let lengthIn = 0;

  for (let index = 0; index < source.length - 1; index += 1) {
    const from = pointInInches(source[index], inchesPerUnit);
    const to = pointInInches(source[index + 1], inchesPerUnit);
    const bulge = source[index].bulge ?? 0;
    if (Math.abs(bulge) < 1e-12) {
      if (!points.length) points.push(from);
      points.push(to);
      lengthIn += distance(from, to);
    } else {
      const arc = bulgeArc(from, to, bulge);
      if (!points.length) points.push(arc.points[0]);
      points.push(...arc.points.slice(1));
      lengthIn += arc.length;
    }
  }
  return { points, lengthIn, closed };
}

function findKnotSpan(knots: number[], degree: number, controlPointCount: number, parameter: number) {
  const lastSpan = controlPointCount - 1;
  if (parameter >= knots[controlPointCount]) return lastSpan;
  for (let index = degree; index < controlPointCount; index += 1) {
    if (parameter >= knots[index] && parameter < knots[index + 1]) return index;
  }
  return degree;
}

function evaluateSpline(controlPoints: IPoint[], knots: number[], degree: number, parameter: number): Point2D {
  const span = findKnotSpan(knots, degree, controlPoints.length, parameter);
  const work = Array.from({ length: degree + 1 }, (_, index) => {
    const point = controlPoints[span - degree + index];
    return { x: point.x, y: point.y };
  });

  for (let level = 1; level <= degree; level += 1) {
    for (let index = degree; index >= level; index -= 1) {
      const leftIndex = span - degree + index;
      const denominator = knots[span + 1 + index - level] - knots[leftIndex];
      const alpha = denominator === 0 ? 0 : (parameter - knots[leftIndex]) / denominator;
      work[index] = {
        x: (1 - alpha) * work[index - 1].x + alpha * work[index].x,
        y: (1 - alpha) * work[index - 1].y + alpha * work[index].y,
      };
    }
  }
  return work[degree];
}

function splinePath(entity: ISplineEntity, inchesPerUnit: number): Path {
  const controlPoints = entity.controlPoints ?? [];
  const knots = entity.knotValues ?? [];
  const degree = entity.degreeOfSplineCurve;
  if (entity.rational) {
    throw new GeometryError(
      "UNSUPPORTED_ENTITY",
      "This DXF contains a rational SPLINE. Convert it to arcs or polylines before uploading.",
    );
  }
  if (controlPoints.length < degree + 1 || knots.length < controlPoints.length + degree + 1) {
    throw new GeometryError("INVALID_DXF", "A SPLINE in this DXF has incomplete control-point or knot data.");
  }

  const start = knots[degree];
  const end = knots[controlPoints.length];
  const distinctSpans = knots.slice(degree, controlPoints.length + 1).filter((value, index, values) => index === 0 || value !== values[index - 1]);
  const sampleCount = Math.max(64, (distinctSpans.length - 1) * 48);
  const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const parameter = index === sampleCount ? end : start + ((end - start) * index) / sampleCount;
    const point = evaluateSpline(controlPoints, knots, degree, parameter);
    return { x: point.x * inchesPerUnit, y: point.y * inchesPerUnit };
  });
  if (entity.closed && !pointsMatch(points[0], points.at(-1)!)) points.push(points[0]);
  return { points, lengthIn: polylineLength(points), closed: entity.closed };
}

function validatePlanar(entity: IEntity) {
  let points: IPoint[] = [];
  if (entity.type === "LINE") points = (entity as ILineEntity).vertices;
  if (entity.type === "ARC") points = [(entity as IArcEntity).center];
  if (entity.type === "CIRCLE") points = [(entity as ICircleEntity).center];
  if (entity.type === "LWPOLYLINE") points = (entity as ILwpolylineEntity).vertices;
  if (entity.type === "POLYLINE") points = (entity as IPolylineEntity).vertices;
  if (entity.type === "SPLINE") points = (entity as ISplineEntity).controlPoints ?? [];
  if (points.some((point) => Math.abs(point.z ?? 0) > 1e-7)) {
    throw new GeometryError("NON_PLANAR_DXF", "This DXF contains geometry outside the XY plane.");
  }
}

function entityToPath(entity: IEntity, inchesPerUnit: number): Path {
  validatePlanar(entity);
  if (entity.type === "LINE") {
    const vertices = (entity as ILineEntity).vertices.map((point) => pointInInches(point, inchesPerUnit));
    return { points: vertices, lengthIn: polylineLength(vertices), closed: pointsMatch(vertices[0], vertices.at(-1)!) };
  }
  if (entity.type === "CIRCLE") {
    const circle = entity as ICircleEntity;
    const center = pointInInches(circle.center, inchesPerUnit);
    const radius = circle.radius * inchesPerUnit;
    return { points: sampleArc(center, radius, 0, Math.PI * 2), lengthIn: 2 * Math.PI * radius, closed: true };
  }
  if (entity.type === "ARC") {
    const arc = entity as IArcEntity;
    const center = pointInInches(arc.center, inchesPerUnit);
    const radius = arc.radius * inchesPerUnit;
    const sweep = normalizeSweep(arc.startAngle, arc.endAngle);
    return { points: sampleArc(center, radius, arc.startAngle, sweep), lengthIn: radius * sweep, closed: false };
  }
  if (entity.type === "LWPOLYLINE") {
    const polyline = entity as ILwpolylineEntity;
    return polylinePath(polyline.vertices, polyline.shape, inchesPerUnit);
  }
  if (entity.type === "POLYLINE") {
    const polyline = entity as IPolylineEntity;
    if (polyline.is3dPolyline || polyline.is3dPolygonMesh || polyline.isPolyfaceMesh) {
      throw new GeometryError("NON_PLANAR_DXF", "This DXF contains a 3D polyline or mesh.");
    }
    return polylinePath(polyline.vertices, polyline.shape, inchesPerUnit);
  }
  return splinePath(entity as ISplineEntity, inchesPerUnit);
}

function closePath(points: Point2D[]) {
  if (points.length > 1 && !pointsMatch(points[0], points.at(-1)!)) return points.concat(points[0]);
  return points;
}

/**
 * Spatial index over the open paths' endpoints.
 *
 * Joining paths means finding one whose start or end lands within
 * CLOSED_TOLERANCE_IN of a given point. Scanning every remaining path for
 * each join is O(n^2), a 40,000-segment drawing took ~34s and a 60,000
 * one ~81s, which is long enough for an anonymous upload to pin a
 * serverless function. Bucketing endpoints into a grid whose cell is the
 * match tolerance means any point within tolerance is in the same cell or
 * one of the eight around it, so a join inspects a handful of candidates
 * instead of the whole set, and the stitch drops to O(n).
 */
class EndpointIndex {
  private readonly cells = new Map<string, number[]>();

  constructor(paths: Path[]) {
    paths.forEach((path, index) => {
      if (path.closed) return;
      this.add(path.points[0], index);
      this.add(path.points.at(-1)!, index);
    });
  }

  private static key(x: number, y: number) {
    return `${x},${y}`;
  }

  private add(point: Point2D, index: number) {
    const key = EndpointIndex.key(
      Math.floor(point.x / CLOSED_TOLERANCE_IN),
      Math.floor(point.y / CLOSED_TOLERANCE_IN),
    );
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  /**
   * Every path index with an endpoint in the nine cells around `point`.
   * Candidates still get the exact distance test, the grid only narrows
   * the field. Duplicates are possible (a path whose two endpoints share
   * a cell) and harmless; the caller takes the lowest index.
   */
  near(point: Point2D): number[] {
    const cx = Math.floor(point.x / CLOSED_TOLERANCE_IN);
    const cy = Math.floor(point.y / CLOSED_TOLERANCE_IN);
    const found: number[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = this.cells.get(EndpointIndex.key(cx + dx, cy + dy));
        if (bucket) found.push(...bucket);
      }
    }
    return found;
  }
}

function stitchPaths(paths: Path[]): GeometryLoop[] {
  const completed: GeometryLoop[] = [];
  const index = new EndpointIndex(paths);
  // Paths are consumed by marking rather than splicing, so the indices
  // held by the endpoint grid stay valid for the whole stitch.
  const used = new Array<boolean>(paths.length).fill(false);

  for (let seedIndex = 0; seedIndex < paths.length; seedIndex += 1) {
    if (used[seedIndex]) continue;
    used[seedIndex] = true;
    const seed = paths[seedIndex];

    if (seed.closed) {
      completed.push({ points: closePath(seed.points), perimeterIn: seed.lengthIn });
      continue;
    }

    const points = [...seed.points];
    let lengthIn = seed.lengthIn;
    let foundConnection = true;
    while (!pointsMatch(points[0], points.at(-1)!) && foundConnection) {
      foundConnection = false;
      const tail = points.at(-1)!;

      // Lowest index wins, reproducing the previous linear scan's choice
      // when several paths meet at one point.
      let bestIndex = -1;
      let bestAtStart = false;
      for (const candidateIndex of index.near(tail)) {
        if (used[candidateIndex]) continue;
        if (bestIndex !== -1 && candidateIndex >= bestIndex) continue;
        const candidate = paths[candidateIndex];
        if (candidate.closed) continue;
        const matchesStart = pointsMatch(tail, candidate.points[0]);
        const matchesEnd = !matchesStart && pointsMatch(tail, candidate.points.at(-1)!);
        if (!matchesStart && !matchesEnd) continue;
        bestIndex = candidateIndex;
        bestAtStart = matchesStart;
      }

      if (bestIndex !== -1) {
        const candidate = paths[bestIndex];
        if (bestAtStart) points.push(...candidate.points.slice(1));
        else points.push(...candidate.points.slice(0, -1).reverse());
        lengthIn += candidate.lengthIn;
        used[bestIndex] = true;
        foundConnection = true;
      }
    }

    if (!pointsMatch(points[0], points.at(-1)!)) {
      throw new GeometryError(
        "OPEN_GEOMETRY",
        "This file contains open geometry. Every cut path must form a closed contour.",
        { start: points[0], end: points.at(-1), toleranceIn: CLOSED_TOLERANCE_IN },
      );
    }
    points[points.length - 1] = points[0];
    completed.push({ points, perimeterIn: lengthIn });
  }
  return completed;
}

function makeBoundingBox(loops: GeometryLoop[]) {
  const allPoints = loops.flatMap((loop) => loop.points);
  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function analyzeDxf(dxfText: string, unitOverride?: UnitOverride): GeometryAnalysis {
  if (!dxfText.trim()) throw new GeometryError("EMPTY_FILE", "The uploaded DXF is empty.");

  let parsed;
  try {
    parsed = new DxfParser().parseSync(dxfText);
  } catch {
    throw new GeometryError("INVALID_DXF", "We couldn’t read this DXF. Export it as an ASCII DXF and try again.");
  }
  if (!parsed) throw new GeometryError("INVALID_DXF", "We couldn’t read this DXF.");

  const unit = resolveUnit(parsed.header?.$INSUNITS, unitOverride);
  const unsupported = new Set<string>();
  const warnings: string[] = [];
  const paths: Path[] = [];
  for (const entity of parsed.entities ?? []) {
    if (entity.visible === false || entity.inPaperSpace) continue;
    if (IGNORED_ENTITY_TYPES.has(entity.type)) continue;
    if (!SUPPORTED_ENTITY_TYPES.has(entity.type)) {
      unsupported.add(entity.type);
      continue;
    }
    const path = entityToPath(entity, unit.inchesPerUnit);
    if (path.points.length < 2 || path.lengthIn <= 0) {
      warnings.push(`${entity.type} entity ${entity.handle ?? "unknown"} had no usable geometry.`);
      continue;
    }
    paths.push(path);
  }

  if (unsupported.size) {
    throw new GeometryError(
      "UNSUPPORTED_ENTITY",
      `This DXF contains unsupported entities: ${[...unsupported].sort().join(", ")}.`,
      { entities: [...unsupported].sort() },
    );
  }
  if (!paths.length) throw new GeometryError("NO_CUT_GEOMETRY", "This DXF does not contain any supported cut geometry.");

  const loops = stitchPaths(paths);
  const boundingBox = makeBoundingBox(loops);
  if (boundingBox.width <= 0 || boundingBox.height <= 0) {
    throw new GeometryError("NO_CUT_GEOMETRY", "The part has no measurable width or height.");
  }
  return {
    sourceUnit: unit.unit,
    boundingBox,
    cutLengthIn: loops.reduce((sum, loop) => sum + loop.perimeterIn, 0),
    closedLoopCount: loops.length,
    loops,
    warnings,
  };
}

export function analyzeDxfPreview(dxfText: string, unitOverride?: UnitOverride) {
  try {
    const analysis = analyzeDxf(dxfText, unitOverride);
    return { analysis, detectedUnit: analysis.sourceUnit };
  } catch (error) {
    if (!unitOverride && error instanceof GeometryError && error.code === "UNIT_REQUIRED") {
      return { analysis: analyzeDxf(dxfText, "mm"), detectedUnit: "unspecified" as const };
    }
    throw error;
  }
}
