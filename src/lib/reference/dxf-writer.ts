/**
 * Minimal DXF writer for nest output.
 *
 * Emits R12 (AC1009) with old-style POLYLINE/VERTEX entities rather than
 * LWPOLYLINE. LWPOLYLINE is a third the size but needs R2000+, and shop
 * software for cutters is routinely older than that; R12 polylines are the
 * format essentially everything imports. Size is dealt with by simplifying
 * the contour instead, see `simplifyLoop`.
 *
 * Coordinates are inches, matching the rest of the pricing and nesting code,
 * and the header declares that so an importer does not have to guess.
 */

export type DxfPoint = { x: number; y: number };

export type DxfLayer = {
  name: string;
  /** AutoCAD color index. 7 is the default black/white. */
  color: number;
};

export type DxfPolyline = {
  points: DxfPoint[];
  layer: string;
  closed: boolean;
};

/**
 * Ramer–Douglas–Peucker. Arcs and splines arrive from the analysers sampled
 * into thousands of segments; at a tolerance far below the kerf this drops
 * most of them without moving the cut path anywhere a cutter could resolve.
 */
export function simplifyLoop(points: DxfPoint[], toleranceIn: number): DxfPoint[] {
  if (points.length < 3 || toleranceIn <= 0) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  // Explicit stack: a deeply sampled contour would blow the call stack.
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    const a = points[first];
    const b = points[last];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy);

    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const p = points[i];
      // Perpendicular distance, falling back to point distance for a
      // degenerate span so a closed loop's endpoints cannot divide by zero.
      const distance = span === 0
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / span;
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }

    if (worst > toleranceIn) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function group(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

/** Fixed 6 decimals: 1e-6 in is far finer than any cutter resolves. */
const coord = (value: number) => value.toFixed(6);

function polylineEntity(polyline: DxfPolyline, color: number) {
  let out = group(0, "POLYLINE");
  out += group(8, polyline.layer);
  out += group(62, color);
  out += group(66, 1); // Vertices follow.
  out += group(70, polyline.closed ? 1 : 0);
  // R12 readers expect a dummy position on the POLYLINE header itself.
  out += group(10, coord(0));
  out += group(20, coord(0));
  out += group(30, coord(0));
  for (const point of polyline.points) {
    out += group(0, "VERTEX");
    out += group(8, polyline.layer);
  out += group(62, color);
    out += group(10, coord(point.x));
    out += group(20, coord(point.y));
    out += group(30, coord(0));
  }
  out += group(0, "SEQEND");
  out += group(8, polyline.layer);
  out += group(62, color);
  return out;
}

/**
 * A bare reference marker. POINT has no path, so a cutter has nothing to
 * follow even if the layer is left switched on, which is the entire reason
 * the sheet is marked this way instead of being drawn as a rectangle.
 */
export type DxfPoint2D = { at: DxfPoint; layer: string };

function pointEntity(point: DxfPoint2D, color: number) {
  // Entity type, layer, then the position triple, the whole of a POINT in
  // R12. Deliberately no 100 subclass markers: those arrive with R13, and an
  // AC1009 reader treats one as a stray group rather than as the hint it is.
  let out = group(0, "POINT");
  out += group(8, point.layer);
  out += group(62, color);
  out += group(10, coord(point.at.x));
  out += group(20, coord(point.at.y));
  out += group(30, coord(0));
  return out;
}

export type DxfDocument = {
  polylines: DxfPolyline[];
  /** Reference markers, e.g. the sheet corners. */
  points?: DxfPoint2D[];
  layers: DxfLayer[];
  /** Sheet extents in inches, written to $EXTMIN/$EXTMAX. */
  extents: { minX: number; minY: number; maxX: number; maxY: number };
};

export function writeDxf(document: DxfDocument): string {
  const { extents } = document;

  let out = "";
  out += group(0, "SECTION");
  out += group(2, "HEADER");
  out += group(9, "$ACADVER");
  out += group(1, "AC1009");
  // 1 = inches. Without this an importer falls back to its own default and
  // silently scales the whole nest.
  out += group(9, "$INSUNITS");
  out += group(70, 1);
  out += group(9, "$MEASUREMENT");
  out += group(70, 0); // English, matching $INSUNITS.
  // How POINT entities are drawn. Without these a reader defaults $PDMODE to
  // 0, a bare single-pixel dot: invisible against a busy nest, and it does not
  // scale with zoom, so the sheet corners vanish at exactly the zoom level the
  // operator uses to see the whole sheet. 3 is an X-shaped marker, legible on
  // both black and white CAM backgrounds and unmistakably a marker rather than
  // geometry. A negative $PDSIZE is a percentage of viewport size rather than
  // an absolute one, so the marks hold their size at any zoom.
  out += group(9, "$PDMODE");
  out += group(70, 3); // Integer: group code 70.
  out += group(9, "$PDSIZE");
  out += group(40, coord(-2)); // Real: group code 40. Negative = % of viewport.
  out += group(9, "$EXTMIN");
  out += group(10, coord(extents.minX));
  out += group(20, coord(extents.minY));
  out += group(30, coord(0));
  out += group(9, "$EXTMAX");
  out += group(10, coord(extents.maxX));
  out += group(20, coord(extents.maxY));
  out += group(30, coord(0));
  out += group(0, "ENDSEC");

  out += group(0, "SECTION");
  out += group(2, "TABLES");
  out += group(0, "TABLE");
  out += group(2, "LAYER");
  out += group(70, document.layers.length);
  for (const layer of document.layers) {
    out += group(0, "LAYER");
    out += group(2, layer.name);
    out += group(70, 0);
    out += group(62, layer.color);
    out += group(6, "CONTINUOUS");
  }
  out += group(0, "ENDTAB");
  out += group(0, "ENDSEC");

  out += group(0, "SECTION");
  out += group(2, "ENTITIES");
  for (const polyline of document.polylines) out += polylineEntity(polyline, document.layers.find(l => l.name === polyline.layer)?.color ?? 7);
  for (const point of document.points ?? []) out += pointEntity(point, document.layers.find(l => l.name === point.layer)?.color ?? 7);
  out += group(0, "ENDSEC");

  out += group(0, "EOF");
  return out;
}
