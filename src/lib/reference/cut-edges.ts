import { classifyGeometryLoops } from "@/lib/reference/geometry/loop-hierarchy";
import type { Point2D } from "@/lib/reference/geometry/types";

/**
 * Outside edges and holes, told apart for the laser.
 *
 * The beam burns away a kerf, so to cut a part to size the operator offsets
 * the path outward on an outside edge and inward on a hole, and laser software
 * sets that offset by color. With every loop one color, the operators had to
 * pick the holes out by hand on every job before they could cut it. Each kind
 * of edge now arrives on its own layer in its own color, blue outside and red
 * for holes, the pair the shop asked for, so an offset set once per color is
 * right on every file. It also lets them cut the holes first, which keeps a
 * part from shifting before its holes are in.
 */
export const EDGE_LAYERS = {
  outside: { suffix: "OUTSIDE", color: 5 },
  hole: { suffix: "HOLES", color: 1 },
} as const;

/**
 * Which of one part's loops are holes, by the even-odd rule the previews fill
 * by: a loop inside an odd number of the others is a hole, and one inside an
 * even number, an island standing in a hole, is an outside edge again.
 *
 * Always one part at a time. Across a whole sheet, a small part nested in a
 * big one's cutout would sit "inside" that cutout and come out as a hole.
 */
export function holeFlags(loops: readonly (readonly Point2D[])[]): boolean[] {
  return classifyGeometryLoops(loops.map((points) => ({ points }))).map(({ depth }) => depth % 2 === 1);
}

/** The layer and color for one loop of a part whose layers are named from `base`. */
export function edgeLayer(base: string, isHole: boolean) {
  const kind = isHole ? EDGE_LAYERS.hole : EDGE_LAYERS.outside;
  return { name: `${base}-${kind.suffix}`, color: kind.color };
}
