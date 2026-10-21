export type Point2D = {
  x: number;
  y: number;
};

export type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type GeometryLoop = {
  points: Point2D[];
  perimeterIn: number;
};

export type GeometryAnalysis = {
  sourceUnit: "in" | "mm" | "cm" | "m" | "ft";
  sourceThicknessMm?: number;
  boundingBox: BoundingBox;
  cutLengthIn: number;
  closedLoopCount: number;
  loops: GeometryLoop[];
  warnings: string[];
};

export type UnitOverride = "in" | "mm";
