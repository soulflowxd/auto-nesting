import initOpenCascade from "replicad-opencascadejs";
import {
  getOC,
  importSTEP,
  measureArea,
  setOC,
  type AnyShape,
  type Edge,
  type Face,
  type Vector,
  type Wire,
} from "replicad";
import { GeometryError } from "./errors";
import type { GeometryAnalysis, GeometryLoop, Point2D } from "./types";

const MM_PER_INCH = 25.4;
const LEVEL_TOLERANCE_MM = 0.001;
const PARALLEL_TOLERANCE = 1e-6;

let kernelPromise: Promise<void> | undefined;

export function ensureOpenCascade(wasmUrl?: string) {
  kernelPromise ??= initOpenCascade({ print: () => undefined, printErr: () => undefined, ...(wasmUrl ? { locateFile: () => wasmUrl } : {}) }).then((oc) => {
    setOC(oc);
  });
  return kernelPromise;
}

function vectorTuple(vector: Vector): [number, number, number] {
  return vector.toTuple();
}

function subtract(a: Vector, b: Vector): [number, number, number] {
  const aTuple = a.toTuple();
  const bTuple = b.toTuple();
  return [aTuple[0] - bTuple[0], aTuple[1] - bTuple[1], aTuple[2] - bTuple[2]];
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function countSolids(shape: AnyShape) {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(
    shape.wrapped,
    oc.TopAbs_ShapeEnum.TopAbs_SOLID,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  let count = 0;
  while (explorer.More()) {
    count += 1;
    explorer.Next();
  }
  explorer.delete();
  return count;
}

type FacePair = {
  first: Face;
  second: Face;
  normal: [number, number, number];
  distanceMm: number;
  area: number;
};

function findExtrusionFaces(shape: AnyShape): FacePair {
  const planarFaces = shape.faces.filter((face) => face.geomType === "PLANE");
  const candidates: FacePair[] = [];
  for (let firstIndex = 0; firstIndex < planarFaces.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < planarFaces.length; secondIndex += 1) {
      const first = planarFaces[firstIndex];
      const second = planarFaces[secondIndex];
      const firstNormal = normalize(vectorTuple(first.normalAt()));
      const secondNormal = normalize(vectorTuple(second.normalAt()));
      if (Math.abs(Math.abs(dot(firstNormal, secondNormal)) - 1) > PARALLEL_TOLERANCE) continue;
      const firstArea = measureArea(first);
      const secondArea = measureArea(second);
      if (Math.abs(firstArea - secondArea) > Math.max(firstArea, secondArea) * 1e-5) continue;
      const distanceMm = Math.abs(dot(subtract(second.center, first.center), firstNormal));
      if (distanceMm <= LEVEL_TOLERANCE_MM) continue;
      candidates.push({ first, second, normal: firstNormal, distanceMm, area: firstArea });
    }
  }
  // The sheet faces are the largest matching parallel pair. Sorting by the
  // shortest distance can accidentally select two tiny, opposed notch walls
  // when their gap is smaller than the actual sheet thickness.
  candidates.sort((a, b) => b.area - a.area || a.distanceMm - b.distanceMm);
  const selected = candidates[0];
  if (!selected) {
    throw new GeometryError("NOT_FLAT_PART", "This file isn’t a flat 2D part: no matching parallel faces were found.");
  }
  return selected;
}

function projectionLevels(shape: AnyShape, normal: [number, number, number]) {
  const levels = shape.edges.flatMap((edge) => [dot(vectorTuple(edge.startPoint), normal), dot(vectorTuple(edge.endPoint), normal)]);
  const sorted = [...levels].sort((a, b) => a - b);
  const unique: number[] = [];
  for (const level of sorted) {
    if (!unique.length || Math.abs(level - unique.at(-1)!) > LEVEL_TOLERANCE_MM) unique.push(level);
  }
  return { levels, unique, min: sorted[0], max: sorted.at(-1)! };
}

function validatePrism(shape: AnyShape, pair: FacePair) {
  const levelData = projectionLevels(shape, pair.normal);
  if (levelData.unique.length !== 2 || Math.abs(levelData.max - levelData.min - pair.distanceMm) > LEVEL_TOLERANCE_MM * 2) {
    throw new GeometryError(
      "NOT_FLAT_PART",
      "This file isn’t a flat 2D part: its geometry has multiple depths or non-through features.",
    );
  }

  for (const face of shape.faces) {
    if (face.isSame(pair.first) || face.isSame(pair.second)) continue;
    const sideNormal = normalize(vectorTuple(face.normalAt()));
    if (Math.abs(dot(sideNormal, pair.normal)) > PARALLEL_TOLERANCE) {
      throw new GeometryError("NOT_FLAT_PART", "This file isn’t a uniform extrusion; a side face is tapered.");
    }
    const sideLevels = face.edges.flatMap((edge) => [dot(vectorTuple(edge.startPoint), pair.normal), dot(vectorTuple(edge.endPoint), pair.normal)]);
    const sideMin = Math.min(...sideLevels);
    const sideMax = Math.max(...sideLevels);
    if (Math.abs(sideMin - levelData.min) > LEVEL_TOLERANCE_MM || Math.abs(sideMax - levelData.max) > LEVEL_TOLERANCE_MM) {
      throw new GeometryError("NOT_FLAT_PART", "This file isn’t a flat 2D part: all side features must pass through the sheet.");
    }
  }
}

function projectionBasis(normal: [number, number, number]) {
  const reference: [number, number, number] = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const xAxis = normalize(cross(reference, normal));
  const yAxis = normalize(cross(normal, xAxis));
  return { xAxis, yAxis };
}

function sampleEdge(edge: Edge, xAxis: [number, number, number], yAxis: [number, number, number]): Point2D[] {
  const sampleCount = edge.geomType === "LINE" ? 1 : edge.geomType === "CIRCLE" ? 90 : 128;
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const point = vectorTuple(edge.pointAt(index / sampleCount));
    return { x: dot(point, xAxis) / MM_PER_INCH, y: dot(point, yAxis) / MM_PER_INCH };
  });
}

function distance2d(a: Point2D, b: Point2D) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function wireLoop(wire: Wire, basis: ReturnType<typeof projectionBasis>): GeometryLoop {
  const remaining = wire.edges.map((edge) => ({
    points: sampleEdge(edge, basis.xAxis, basis.yAxis),
    lengthIn: edge.length / MM_PER_INCH,
  }));
  const seed = remaining.shift();
  if (!seed) throw new GeometryError("NOT_FLAT_PART", "A face in this STEP file has an empty boundary.");
  const points = [...seed.points];
  let perimeterIn = seed.lengthIn;

  while (remaining.length) {
    const tail = points.at(-1)!;
    const matchIndex = remaining.findIndex((candidate) =>
      distance2d(tail, candidate.points[0]) < 1e-5 || distance2d(tail, candidate.points.at(-1)!) < 1e-5,
    );
    if (matchIndex < 0) {
      throw new GeometryError("NOT_FLAT_PART", "A face boundary in this STEP file could not be flattened cleanly.");
    }
    const candidate = remaining.splice(matchIndex, 1)[0];
    if (distance2d(tail, candidate.points[0]) < 1e-5) points.push(...candidate.points.slice(1));
    else points.push(...candidate.points.slice(0, -1).reverse());
    perimeterIn += candidate.lengthIn;
  }
  if (distance2d(points[0], points.at(-1)!) >= 1e-5) points.push(points[0]);
  else points[points.length - 1] = points[0];
  return { points, perimeterIn };
}

function boundingBox(loops: GeometryLoop[]) {
  const points = loops.flatMap((loop) => loop.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export async function analyzeStep(bytes: Uint8Array): Promise<GeometryAnalysis> {
  if (!bytes.byteLength) throw new GeometryError("EMPTY_FILE", "The uploaded STEP file is empty.");
  await ensureOpenCascade();

  let shape: AnyShape;
  try {
    shape = await importSTEP(new Blob([bytes as BlobPart], { type: "model/step" }));
  } catch {
    throw new GeometryError("INVALID_STEP", "We couldn’t read this STEP file. Re-export it and try again.");
  }
  try {
    if (countSolids(shape) !== 1) {
      throw new GeometryError("NOT_FLAT_PART", "This file isn’t a flat 2D part: upload exactly one solid body.");
    }
    const pair = findExtrusionFaces(shape);
    validatePrism(shape, pair);
    const basis = projectionBasis(pair.normal);
    // RepliCAD's boundary accessors consume their receiver, so use independent
    // clones and leave the selected face alive for the rest of this analysis.
    const innerWires = pair.first.clone().innerWires();
    const wires = [pair.first.clone().outerWire(), ...innerWires];
    const loops = wires.map((wire) => wireLoop(wire, basis));
    const box = boundingBox(loops);
    if (box.width <= 0 || box.height <= 0) {
      throw new GeometryError("NOT_FLAT_PART", "This STEP file has no measurable flat outline.");
    }
    return {
      sourceUnit: "mm",
      sourceThicknessMm: pair.distanceMm,
      boundingBox: box,
      cutLengthIn: loops.reduce((sum, loop) => sum + loop.perimeterIn, 0),
      closedLoopCount: loops.length,
      loops,
      warnings: ["STEP thickness is shown for reference only; choose any stocked sheet thickness."],
    };
  } finally {
    shape.delete();
  }
}
