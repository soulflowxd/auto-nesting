import { edgeLayer, holeFlags } from "@/lib/reference/cut-edges";
import { simplifyLoop, writeDxf, type DxfLayer, type DxfPoint2D, type DxfPolyline } from "@/lib/reference/dxf-writer";
import type { NestPlacement } from "@/lib/reference/nesting";

/**
 * Cut paths land within a thousandth of an inch of the analysed contour,
 * roughly a tenth of a typical kerf, and finer than the nester's own placement
 * grid, so simplification can never be what makes a nest wrong.
 */
export const SIMPLIFY_TOLERANCE_IN = 0.001;

/** Corner markers stay on their own layer so they are trivial to hide. */
const DATUM_LAYER = "SHEET-DATUM";
/** Parts with no order fall back to one shared pair of cut layers. */
const CUT_LAYER = "CUT";

/**
 * The stem of an order's layer names: its outside edges go on `<stem>-OUTSIDE`
 * and its holes on `<stem>-HOLES`. Sanitized: DXF layer names are restricted.
 */
export function orderLayerName(orderNumber: string | undefined) {
  if (!orderNumber) return CUT_LAYER;
  return `CUT-${orderNumber.replace(/[^A-Za-z0-9_-]+/g, "-").toUpperCase()}`;
}

export type SheetDxfInput = {
  placements: NestPlacement[];
  sheetWidthIn: number;
  sheetHeightIn: number;
};

/**
 * One sheet of a nest as a DXF, in inches, in sheet coordinates with the
 * origin at the bottom-left corner, the same frame the nester places in, so
 * what the cutter loads is what the preview showed.
 *
 * The sheet itself is marked with four POINT entities, one at each corner,
 * rather than drawn as a rectangle. A rectangle is a closed path, and a cutter
 * handed the whole file will happily cut it, wrecking the sheet; points carry
 * the same origin and extents information with nothing to follow. Four corners
 * rather than two opposite ones leave the stock outline unambiguous when the
 * operator squares the sheet on the bed, there is no second rectangle the
 * marks could describe, and each physical corner has a mark to line up to.
 *
 * Each order gets its own pair of layers, so the operator can still cut or hide
 * one job at a time. The color says which kind of edge a path is, blue outside
 * and red for holes, since that is what the laser software sets its kerf offset
 * by; see `cut-edges.ts`. Which job a part belongs to is in the layer name and
 * on the nesting page, which still colors by order.
 */
export function sheetToDxf({ placements, sheetWidthIn, sheetHeightIn }: SheetDxfInput) {
  const polylines: DxfPolyline[] = [];
  const layers = new Map<string, DxfLayer>();

  // Bottom-left first: it is the origin the nest is laid out from, so squaring
  // the stock to it means the coordinates in this file are the bed coordinates.
  // The rest run anticlockwise from there, so all four physical corners of the
  // stock have a mark to line up to.
  const points: DxfPoint2D[] = [
    { at: { x: 0, y: 0 }, layer: DATUM_LAYER },
    { at: { x: sheetWidthIn, y: 0 }, layer: DATUM_LAYER },
    { at: { x: sheetWidthIn, y: sheetHeightIn }, layer: DATUM_LAYER },
    { at: { x: 0, y: sheetHeightIn }, layer: DATUM_LAYER },
  ];
  layers.set(DATUM_LAYER, { name: DATUM_LAYER, color: 8 });

  for (const placement of placements) {
    const stem = orderLayerName(placement.orderNumber);
    // Per placement, never across the sheet: see `holeFlags`.
    const holes = holeFlags(placement.outline);
    placement.outline.forEach((loop, index) => {
      const layer = edgeLayer(stem, holes[index]);
      if (!layers.has(layer.name)) layers.set(layer.name, layer);
      // The placement's outline is already rotated and normalized to its own
      // origin, so positioning is a translate, the same step the SVG does.
      const positioned = loop.map((point) => ({ x: placement.x + point.x, y: placement.y + point.y }));
      const simplified = simplifyLoop(positioned, SIMPLIFY_TOLERANCE_IN);
      if (simplified.length < 3) return;
      polylines.push({ layer: layer.name, closed: true, points: simplified });
    });
  }

  return writeDxf({
    polylines,
    points,
    layers: [...layers.values()],
    extents: { minX: 0, minY: 0, maxX: sheetWidthIn, maxY: sheetHeightIn },
  });
}

/** A filename a shop can read off a job sheet without opening it. */
export function nestFileName(materialName: string, thicknessMm: number, sheetIndex: number) {
  const slug = `${materialName}-${thicknessMm}mm`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `nest-${slug}-sheet-${sheetIndex + 1}.dxf`;
}
