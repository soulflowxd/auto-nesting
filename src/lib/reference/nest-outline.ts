import type { GeometryAnalysis } from "@/lib/reference/geometry/types";
import { sanitizeLoopPoints } from "@/lib/reference/geometry/loop-hierarchy";
import type { NestOutline } from "@/lib/reference/nesting";

/**
 * Turn a stored analysis into loops the nester can pack: inches, bounding box
 * at the origin, so a placement only has to translate and rotate them.
 */
export function outlineFromAnalysis(analysis: GeometryAnalysis): NestOutline | undefined {
  const { minX, minY } = analysis.boundingBox;
  const loops = analysis.loops
    .map((loop) => sanitizeLoopPoints(loop.points).map((point) => ({ x: point.x - minX, y: point.y - minY })))
    .filter((points) => points.length >= 3);
  return loops.length ? loops : undefined;
}

/**
 * Whether an analysis is the size that was recorded for the part.
 *
 * The price, and the box the part nests in when it has no contour, were both
 * worked out from that recorded size. A contour read back from the file at
 * some other size, a DXF taken in a different unit say, would nest, count
 * sheets for and draw a part nobody ordered, so a caller drops it instead and
 * the part falls back to its box. Within a hundredth either way, which is far
 * looser than rounding and far tighter than any unit mix-up.
 */
export function matchesRecordedSize(analysis: GeometryAnalysis, widthIn: number, heightIn: number) {
  const close = (read: number, recorded: number) => recorded > 0 && Math.abs(read / recorded - 1) <= 0.01;
  return close(analysis.boundingBox.width, widthIn) && close(analysis.boundingBox.height, heightIn);
}
