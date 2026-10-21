export type GeometryErrorCode =
  | "EMPTY_FILE"
  | "INVALID_DXF"
  | "INVALID_STEP"
  | "NO_CUT_GEOMETRY"
  | "OPEN_GEOMETRY"
  | "UNSUPPORTED_ENTITY"
  | "UNSUPPORTED_UNIT"
  | "UNIT_REQUIRED"
  | "NON_PLANAR_DXF"
  | "UNSUPPORTED_TRANSFORM"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "NOT_FLAT_PART";

export class GeometryError extends Error {
  constructor(
    readonly code: GeometryErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GeometryError";
  }
}
