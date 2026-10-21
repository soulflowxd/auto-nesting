/**
 * Raster auto nester.
 *
 * Collision is tested against the real part contour rasterised onto a grid,
 * not against bounding boxes, so a concave part can tuck into another part's
 * concavity, which is the whole point of nesting. Parts with no contour fall
 * back to their bounding rectangle, which behaves like a plain box packer.
 *
 * What collides is the part's FOOTPRINT, everything inside its outer
 * boundary, cutouts included, not just its material. Cutting a part severs
 * every one of its loops, so a neighbour whose material merely threads
 * through the cutouts would be sliced apart on the bed. A part that is mostly
 * hole rasterises to a thin skeleton, and two skeletons interleave without a
 * single cell colliding: tight on screen, impossible to cut. Cutout space is
 * therefore never offered to another part, even though a small enough one
 * could in principle sit inside, that needs a containment test rather than
 * a collision test, and getting it wrong puts scrap on the bed.
 *
 * Several packing strategies are run and the best result kept, because none
 * of them wins on every set of parts, see STRATEGIES.
 *
 * It is still a planning aid, not the laser's nesting software: placement is
 * quantised to the grid and rotation to a fixed set of angles.
 */

export type NestPoint = { x: number; y: number };

/**
 * Closed loops of a part contour, in inches, with the part's bounding box
 * moved to the origin. The loop enclosing the most area is taken as the outer
 * boundary; the rest are cutouts. Order does not matter.
 */
export type NestOutline = NestPoint[][];

export type NestPart = {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
  /** Job this part belongs to. Echoed onto placements so the nest can be
   *  coloured and labelled by order without the packer knowing what an order is. */
  orderNumber?: string;
  /** The same job's id, carried through so a placement can link to its order. */
  orderId?: string;
  outline?: NestOutline;
};

export type NestPlacement = {
  partId: string;
  label: string;
  sheetIndex: number;
  /** Which physical sheet this landed on; see NestStock.id. */
  sheetId: string;
  /** The job this part is for, carried through from NestPart. */
  orderNumber?: string;
  orderId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  /**
   * The outline already rotated and normalised to the origin, so drawing a
   * placement is a translate, the view never repeats the rotation math.
   */
  outline: NestOutline;
};

/**
 * A sheet the nester may pack into: a full sheet of fresh stock, or a
 * part-used one from inventory whose remaining area is an arbitrary shape.
 */
export type NestStock = {
  /** Stable id echoed onto every placement, so a caller knows which sheet. */
  id: string;
  widthIn: number;
  heightIn: number;
  /**
   * Loops bounding the still-usable area, in sheet coordinates. Omitted means
   * the whole rectangle is usable, which is what fresh stock is.
   */
  usable?: NestOutline;
};

export type NestResult = {
  sheetsUsed: number;
  placements: NestPlacement[];
  unplaced: NestPart[];
};

/** Bare sheet edge kept clear of any part. */
const MARGIN_IN = 0.25;
/** Minimum material left between two neighbouring parts. */
const GAP_IN = 0.2;
/**
 * Cells per gap. The gap is kept as a whole number of cells, so a cell a third
 * of it keeps the gap at exactly GAP_IN. Cells sized from the sheet instead,
 * 220 across, rounded the gap and every part's edge outward, and neighbours
 * sat up to 0.4 inch apart.
 */
const CELLS_PER_GAP = 3;
/** Most cells across a sheet's longer edge; a bigger sheet gets coarser cells rather than a slow nest. */
const MAX_GRID = 900;
/** Cells across the longer edge for the second, coarse nest; see nestOntoStock. */
const COARSE_GRID = 220;
/**
 * Units packed in one pass. Only a longer run is split, and each later pass
 * starts on fresh sheets, so a split can leave one sheet part-empty. It was
 * 150, which left one part-empty sheet per 150 pieces once splitting replaced
 * dropping them, and setup is now charged per sheet.
 */
const MAX_UNITS = 2000;
/** Past this many parts, only the cheapest strategy runs. */
const MULTI_STRATEGY_LIMIT = 40;

/** A rasterised part: 1 where the part is solid, row-major, y up. */
type Mask = { w: number; h: number; cells: Uint8Array };

function rectOutline(widthIn: number, heightIn: number): NestOutline {
  return [[
    { x: 0, y: 0 },
    { x: widthIn, y: 0 },
    { x: widthIn, y: heightIn },
    { x: 0, y: heightIn },
  ]];
}

function rotateOutline(outline: NestOutline, degrees: number): NestOutline {
  if (degrees === 0) return outline;
  const radians = (degrees * Math.PI) / 180;
  // Snap the quarter turns so an axis-aligned part stays exactly axis-aligned
  // rather than picking up a floating-point tilt.
  const exact = degrees % 90 === 0;
  const cos = exact ? Math.round(Math.cos(radians)) : Math.cos(radians);
  const sin = exact ? Math.round(Math.sin(radians)) : Math.sin(radians);
  const rotated = outline.map((loop) =>
    loop.map((point) => ({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos })));
  // Rotating about the origin walks the part off it; pull it back so the
  // bounding box starts at (0, 0) again.
  const points = rotated.flat();
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return rotated.map((loop) => loop.map((point) => ({ x: point.x - minX, y: point.y - minY })));
}

function outlineExtent(outline: NestOutline) {
  const points = outline.flat();
  return {
    width: Math.max(...points.map((point) => point.x)),
    height: Math.max(...points.map((point) => point.y)),
  };
}

function loopArea(loop: NestPoint[]) {
  let sum = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** The part's outer boundary: the loop enclosing the most area. */
function outerLoop(outline: NestOutline) {
  let best = outline[0];
  let bestArea = -1;
  for (const loop of outline) {
    const area = loopArea(loop);
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

/**
 * Scanline fill with the even-odd rule. Edges are then stamped in so thin
 * features and the boundary itself survive at coarse cell sizes; a cell that
 * is wrongly solid only costs a little packing density, whereas a wrongly
 * empty one lets parts overlap.
 *
 * `dims` forces the output size so masks rasterised from different subsets of
 * the same part stay aligned cell for cell.
 */
function rasterize(outline: NestOutline, cell: number, dims?: { w: number; h: number }): Mask {
  const extent = outlineExtent(outline);
  const w = dims?.w ?? Math.max(1, Math.ceil(extent.width / cell));
  const h = dims?.h ?? Math.max(1, Math.ceil(extent.height / cell));
  const cells = new Uint8Array(w * h);

  const edges = outline.flatMap((loop) =>
    loop.map((from, index) => ({ from, to: loop[(index + 1) % loop.length] })));

  for (let row = 0; row < h; row += 1) {
    const y = (row + 0.5) * cell;
    const crossings: number[] = [];
    for (const { from, to } of edges) {
      if (from.y === to.y) continue;
      if (y < Math.min(from.y, to.y) || y >= Math.max(from.y, to.y)) continue;
      crossings.push(from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x));
    }
    crossings.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const startCol = Math.max(0, Math.ceil(crossings[pair] / cell - 0.5));
      const endCol = Math.min(w - 1, Math.floor(crossings[pair + 1] / cell - 0.5));
      for (let col = startCol; col <= endCol; col += 1) cells[row * w + col] = 1;
    }
  }

  for (const { from, to } of edges) stampSegment(cells, w, h, cell, from, to);
  return { w, h, cells };
}

/** Mark every cell a segment passes through, sampled at half-cell steps. */
function stampSegment(cells: Uint8Array, w: number, h: number, cell: number, from: NestPoint, to: NestPoint) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil((length / cell) * 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const col = Math.floor((from.x + (to.x - from.x) * t) / cell);
    const row = Math.floor((from.y + (to.y - from.y) * t) / cell);
    if (col >= 0 && col < w && row >= 0 && row < h) cells[row * w + col] = 1;
  }
}

/**
 * Grow a mask by `radius` cells in every direction. Testing the grown mask
 * against neighbours already placed is what enforces the gap between parts,
 * including across a concave notch one part is tucked into.
 */
function dilate(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  const w = mask.w + radius * 2;
  const h = mask.h + radius * 2;
  const cells = new Uint8Array(w * h);
  for (let row = 0; row < mask.h; row += 1) {
    for (let col = 0; col < mask.w; col += 1) {
      if (!mask.cells[row * mask.w + col]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          cells[(row + radius + dy) * w + (col + radius + dx)] = 1;
        }
      }
    }
  }
  return { w, h, cells };
}

/**
 * The same grid packed 32 cells to a word. Every candidate position has to be
 * collision-tested, so the search runs a word at a time rather than a cell at
 * a time, that is what buys the resolution and the exhaustive scan below.
 */
type Bitmask = { w: number; h: number; words: number; bits: Uint32Array };

function toBitmask(mask: Mask): Bitmask {
  const words = (mask.w + 31) >> 5;
  const bits = new Uint32Array(words * mask.h);
  for (let row = 0; row < mask.h; row += 1) {
    for (let col = 0; col < mask.w; col += 1) {
      if (mask.cells[row * mask.w + col]) bits[row * words + (col >> 5)] |= 1 << (col & 31);
    }
  }
  return { w: mask.w, h: mask.h, words, bits };
}

type Sheet = {
  /** Which physical sheet this is; echoed onto placements. */
  id: string;
  /** Union of every placed part's footprint. */
  grid: Bitmask;
  /**
   * Cutout interiors of placed parts that nothing has since been placed into.
   * A part may go here, but only if it fits *entirely* within, see canPlace.
   */
  cutouts: Bitmask;
  /** Set once anything with a cutout lands, so the extra test can be skipped. */
  hasCutouts: boolean;
  /** Bounding box of everything placed so far, used to score tightness. */
  used: { minCol: number; minRow: number; maxCol: number; maxRow: number } | null;
};

function fits(sheet: Bitmask, mask: Bitmask, originCol: number, originRow: number) {
  if (originCol + mask.w > sheet.w || originRow + mask.h > sheet.h) return false;
  const wordOffset = originCol >>> 5;
  const bitOffset = originCol & 31;
  for (let row = 0; row < mask.h; row += 1) {
    const maskRow = row * mask.words;
    const sheetRow = (originRow + row) * sheet.words;
    for (let word = 0; word <= mask.words; word += 1) {
      const current = word < mask.words ? mask.bits[maskRow + word] : 0;
      const previous = word > 0 ? mask.bits[maskRow + word - 1] : 0;
      const shifted = bitOffset === 0 ? current : (current << bitOffset) | (previous >>> (32 - bitOffset));
      if (shifted === 0) continue;
      const index = wordOffset + word;
      // Bounds were checked above, so anything past the last word is empty
      // sheet that the part cannot reach.
      if (index >= sheet.words) return false;
      if (sheet.bits[sheetRow + index] & shifted) return false;
    }
  }
  return true;
}

/**
 * True when every cell of `mask` is already set in `sheet`. This is the
 * containment test that makes cutout nesting safe: a part is only allowed into
 * cutout space if the whole of it, padded for clearance, lies within, so its
 * cut path can never meet the cut path around it. A collision test cannot say
 * this, which is why treating cutouts as merely "not material" let skeletal
 * parts thread through each other.
 */
function containedIn(sheet: Bitmask, mask: Bitmask, originCol: number, originRow: number) {
  if (originCol + mask.w > sheet.w || originRow + mask.h > sheet.h) return false;
  const wordOffset = originCol >>> 5;
  const bitOffset = originCol & 31;
  for (let row = 0; row < mask.h; row += 1) {
    const maskRow = row * mask.words;
    const sheetRow = (originRow + row) * sheet.words;
    for (let word = 0; word <= mask.words; word += 1) {
      const current = word < mask.words ? mask.bits[maskRow + word] : 0;
      const previous = word > 0 ? mask.bits[maskRow + word - 1] : 0;
      const shifted = bitOffset === 0 ? current : (current << bitOffset) | (previous >>> (32 - bitOffset));
      if (shifted === 0) continue;
      const index = wordOffset + word;
      if (index >= sheet.words) return false;
      if (shifted & ~sheet.bits[sheetRow + index]) return false;
    }
  }
  return true;
}

/**
 * Either the spot is clear of every footprint, or it lies wholly inside cutout
 * space that a placed part has left behind.
 */
function canPlace(sheet: Sheet, mask: Bitmask, col: number, row: number) {
  if (fits(sheet.grid, mask, col, row)) return true;
  return sheet.hasCutouts && containedIn(sheet.cutouts, mask, col, row);
}

function stamp(sheet: Bitmask, mask: Bitmask, originCol: number, originRow: number, clear = false) {
  const wordOffset = originCol >>> 5;
  const bitOffset = originCol & 31;
  for (let row = 0; row < mask.h; row += 1) {
    const maskRow = row * mask.words;
    const sheetRow = (originRow + row) * sheet.words;
    for (let word = 0; word <= mask.words; word += 1) {
      const current = word < mask.words ? mask.bits[maskRow + word] : 0;
      const previous = word > 0 ? mask.bits[maskRow + word - 1] : 0;
      const shifted = bitOffset === 0 ? current : (current << bitOffset) | (previous >>> (32 - bitOffset));
      if (shifted === 0) continue;
      const index = sheetRow + wordOffset + word;
      if (clear) sheet.bits[index] &= ~shifted;
      else sheet.bits[index] |= shifted;
    }
  }
}

type Spot = { col: number; row: number; cost: number };

/**
 * Bottom-left fill: the lowest row that fits, then the leftmost column in it.
 * Keeps the free area in one usable block, which is what lets later parts
 * still find room.
 *
 * `from` is a spot, as row * width + col, known to be no later than the first
 * one that fits, so the scan can start there; see SearchMemo.
 */
function findBottomLeft(sheet: Sheet, mask: Bitmask, from = 0): Spot | null {
  const startRow = Math.floor(from / sheet.grid.w);
  for (let row = startRow; row + mask.h <= sheet.grid.h; row += 1) {
    for (let col = row === startRow ? from % sheet.grid.w : 0; col + mask.w <= sheet.grid.w; col += 1) {
      if (canPlace(sheet, mask, col, row)) return { col, row, cost: row * sheet.grid.w + col };
    }
  }
  return null;
}

/**
 * Area of the sheet's occupied bounding box once this part is added. Dropping
 * a part into an existing gap grows the envelope by nothing, while sitting
 * alongside grows it a lot, so this pulls parts into each other's concavities
 *, tighter to look at, but it can leave an L-shaped remainder too narrow for
 * the next part. Which of the two wins depends on the parts, so both run.
 */
function findTightest(sheet: Sheet, mask: Bitmask): Spot | null {
  let best: Spot | null = null;
  for (let row = 0; row + mask.h <= sheet.grid.h; row += 1) {
    for (let col = 0; col + mask.w <= sheet.grid.w; col += 1) {
      const minCol = Math.min(sheet.used?.minCol ?? col, col);
      const minRow = Math.min(sheet.used?.minRow ?? row, row);
      const maxCol = Math.max(sheet.used?.maxCol ?? col + mask.w - 1, col + mask.w - 1);
      const maxRow = Math.max(sheet.used?.maxRow ?? row + mask.h - 1, row + mask.h - 1);
      const cost = (maxCol - minCol + 1) * (maxRow - minRow + 1);
      // Ties go to the lower, more-left position already held.
      if (best && cost >= best.cost) continue;
      if (!canPlace(sheet, mask, col, row)) continue;
      best = { col, row, cost };
    }
  }
  return best;
}

type Strategy = {
  /** Angles a contoured part may be turned to. */
  rotations: number[];
  find: (sheet: Sheet, mask: Bitmask, from: number) => Spot | null;
  /**
   * Whether the spot found is the first that fits in scan order, so the next
   * search for the same mask on the same sheet may start from it.
   */
  resumable: boolean;
};

/*
 * No single rule wins on every set of parts, and each of these loses badly on
 * some: bottom-left leaves curved parts looking loose, tightest-envelope can
 * cost a whole extra sheet, and fine angles let a part sink lower while
 * sprawling. Running all of them and keeping the best result is cheap
 * relative to the sheets it saves.
 */
const STRATEGIES: Strategy[] = [
  { rotations: [0, 90, 180, 270], find: findBottomLeft, resumable: true },
  { rotations: [0, 90, 180, 270], find: findTightest, resumable: false },
  { rotations: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], find: findBottomLeft, resumable: true },
];

/**
 * What earlier searches learned, keyed by sheet, part and orientation: -1 when
 * the mask fits nowhere on that sheet, else the spot to resume scanning from.
 *
 * Both hold because a sheet only ever fills. A placement claims free cells and
 * never frees any, and the cutout space it offers was free space a moment
 * before, so a spot that did not fit never starts to. A mask that fit nowhere
 * never will, and its first fitting spot in scan order can only move later.
 * That is what makes it affordable to try every open sheet for every part:
 * without it, each copy of a part rescanned the full sheets ahead of it, and
 * the nester limited itself to the last three sheets, so the cutouts and edges
 * left on earlier ones were never filled.
 */
type SearchMemo = Map<string, number>;

type Candidate = {
  rotationDeg: number;
  outline: NestOutline;
  width: number;
  height: number;
  /** Footprint grown by the gap; used to test whether a spot is free. */
  padded: Bitmask;
  /**
   * Everything inside the outer boundary, holes included. Cutting a part
   * severs every one of its loops, so the whole footprint is consumed, a
   * neighbour may not thread its material through these cutouts.
   */
  footprint: Bitmask;
  /**
   * The part's cutout interiors. Offered to later parts as space they may sit
   * wholly inside, never as space they may merely avoid colliding with.
   */
  cutouts: Bitmask;
  /** Whether this part has any cutout worth offering at all. */
  hasCutouts: boolean;
  padding: number;
};


/** Pack every unit with one strategy. Cheap enough to run several times. */
function packWith(
  strategy: Strategy,
  units: NestPart[],
  cell: number,
  stock: NestStock[],
  fresh: NestStock,
  gapCells: number, options: NestOptions): NestResult {
  const marginCells = Math.ceil(options.marginIn / cell);

  /** Grid dimensions for a sheet, inset by the margin kept clear of its edge. */
  function sheetGrid(spec: NestStock) {
    return {
      cols: Math.max(0, Math.floor(spec.widthIn / cell) - marginCells * 2),
      rows: Math.max(0, Math.floor(spec.heightIn / cell) - marginCells * 2),
    };
  }

  /**
   * Build a sheet, pre-occupying everything outside its usable region. Fresh
   * stock has no region and starts empty; a part-used sheet from inventory
   * starts with its already-cut area blocked, so the packer treats a remnant
   * exactly like a sheet that happens to be mostly full.
   */
  function makeSheet(spec: NestStock): Sheet {
    const { cols, rows } = sheetGrid(spec);
    const words = (cols + 31) >> 5;
    const sheet: Sheet = {
      id: spec.id,
      grid: { w: cols, h: rows, words, bits: new Uint32Array(words * rows) },
      cutouts: { w: cols, h: rows, words, bits: new Uint32Array(words * rows) },
      hasCutouts: false,
      used: null,
    };
    if (!spec.usable?.length || cols <= 0 || rows <= 0) return sheet;

    // The grid's (0,0) is MARGIN_IN into the sheet, so shift the region to match.
    const shifted = spec.usable.map((loop) => loop.map((point) => ({ x: point.x - options.marginIn, y: point.y - options.marginIn })));
    const usable = rasterize(shifted, cell, { w: cols, h: rows });
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (usable.cells[row * cols + col]) continue;
        sheet.grid.bits[row * words + (col >> 5)] |= 1 << (col & 31);
      }
    }
    return sheet;
  }

  // One part may appear many times; rasterising it once per rotation and
  // reusing that keeps the cost proportional to distinct parts, not units.
  const candidateCache = new Map<string, Candidate[]>();
  function candidatesFor(part: NestPart): Candidate[] {
    const cached = candidateCache.get(part.id);
    if (cached) return cached;
    const contoured = Boolean(part.outline?.length);
    const base = contoured ? part.outline! : rectOutline(part.widthIn, part.heightIn);
    const built: Candidate[] = [];
    const seen = new Set<string>();
    // A plain rectangle gains nothing from an off-axis angle, so it only ever
    // gets the quarter turns even when the strategy offers more.
    const rotations = contoured ? strategy.rotations : strategy.rotations.filter((deg) => deg % 90 === 0);
    for (const rotationDeg of rotations) {
      const outline = rotateOutline(base, rotationDeg);
      const { width, height } = outlineExtent(outline);
      // The footprint drives collision: everything inside the outer boundary
      // is consumed when the part is cut. The material raster is only needed
      // to work out which of those cells are cutouts.
      const footprint = rasterize([outerLoop(outline)], cell);
      const material = rasterize(outline, cell, footprint);
      /*
       * Cutout space, eroded by the clearance gap so a part nested inside can
       * never come closer than GAP_IN to the cut path around it. Erosion is
       * dilation of the complement, done here by growing the material and
       * subtracting it.
       */
      const grownMaterial = dilate(material, gapCells);
      const cutouts: Mask = { w: footprint.w, h: footprint.h, cells: new Uint8Array(footprint.cells.length) };
      let cutoutCells = 0;
      for (let row = 0; row < footprint.h; row += 1) {
        for (let col = 0; col < footprint.w; col += 1) {
          const index = row * footprint.w + col;
          const grown = grownMaterial.cells[(row + gapCells) * grownMaterial.w + (col + gapCells)];
          if (footprint.cells[index] && !grown) {
            cutouts.cells[index] = 1;
            cutoutCells += 1;
          }
        }
      }
      // A symmetric part rasterises identically at 0 and 180; skipping the
      // duplicates keeps the search from repeating the same work.
      const signature = `${footprint.w}x${footprint.h}:${footprint.cells.join("")}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      built.push({
        rotationDeg,
        outline,
        width,
        height,
        footprint: toBitmask(footprint),
        cutouts: toBitmask(cutouts),
        hasCutouts: options.allowInsideHoles && cutoutCells > 0,
        padded: toBitmask(dilate(footprint, gapCells)),
        padding: gapCells,
      });
    }
    candidateCache.set(part.id, built);
    return built;
  }

  const sheets: Sheet[] = [];
  const memo: SearchMemo = new Map();
  const placements: NestPlacement[] = [];
  const unplaced: NestPart[] = [];

  for (const unit of units) {
    const candidates = candidatesFor(unit);
    /*
     * Anything larger than the biggest sheet on offer in every orientation can
     * never be cut, however the rest of that sheet is arranged. Fresh stock is
     * the largest thing available, so it sets the ceiling.
     */
    const largest = sheetGrid(fresh);
    if (!candidates.some((c) => c.padded.w <= largest.cols && c.padded.h <= largest.rows)) {
      unplaced.push(unit);
      continue;
    }

    let placed = false;
    // Every open sheet, oldest first, so a gap or cutout left on an early sheet
    // is filled before a new sheet is started; the memo keeps this cheap.
    for (let sheetIndex = 0; sheetIndex <= sheets.length && !placed; sheetIndex += 1) {
      if (sheetIndex === sheets.length) {
        /*
         * Open the next sheet: inventory first, in the order the caller gave
         * (smallest usable area first, so big stock is preserved), and only
         * then a fresh sheet. Cutting from a remnant is always preferable to
         * breaking into new material.
         */
        const spec = sheetIndex < stock.length
          ? stock[sheetIndex]
          : { ...fresh, id: `${fresh.id}-${sheetIndex - stock.length + 1}` };
        sheets.push(makeSheet(spec));
      }
      const sheet = sheets[sheetIndex];

      let best: { candidate: Candidate; col: number; row: number; cost: number } | null = null;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const key = `${sheetIndex}:${unit.id}:${index}`;
        const known = memo.get(key);
        if (known === -1) continue;
        const spot = strategy.find(sheet, candidate.padded, strategy.resumable ? known ?? 0 : 0);
        if (!spot) {
          memo.set(key, -1);
          continue;
        }
        if (strategy.resumable) memo.set(key, spot.cost);
        // The strategy's own cost decides between orientations too, so a turn
        // that lets the part sit better wins on the same terms.
        if (!best || spot.cost < best.cost) best = { candidate, ...spot };
      }
      if (!best) continue;

      // The spot was found for the padded mask, whose origin sits `padding`
      // cells outside the part itself.
      const solidCol = best.col + best.candidate.padding;
      const solidRow = best.row + best.candidate.padding;
      /*
       * Claim the whole footprint, then publish this part's cutouts as space a
       * later part may sit wholly inside. The cutouts are NOT removed from the
       * footprint grid, a part gets in there by passing containedIn, never by
       * merely failing to collide, which is what kept two skeletons apart.
       *
       * Anything the new part covers stops being available, including cutout
       * space it was itself nested into.
       */
      stamp(sheet.grid, best.candidate.footprint, solidCol, solidRow);
      stamp(sheet.cutouts, best.candidate.footprint, solidCol, solidRow, true);
      if (best.candidate.hasCutouts) {
        stamp(sheet.cutouts, best.candidate.cutouts, solidCol, solidRow);
        sheet.hasCutouts = true;
      }
      sheet.used = {
        minCol: Math.min(sheet.used?.minCol ?? solidCol, solidCol),
        minRow: Math.min(sheet.used?.minRow ?? solidRow, solidRow),
        maxCol: Math.max(sheet.used?.maxCol ?? 0, solidCol + best.candidate.footprint.w - 1),
        maxRow: Math.max(sheet.used?.maxRow ?? 0, solidRow + best.candidate.footprint.h - 1),
      };
      placements.push({
        partId: unit.id,
        label: unit.label,
        sheetIndex,
        sheetId: sheet.id,
        orderNumber: unit.orderNumber,
        orderId: unit.orderId,
        x: options.marginIn + solidCol * cell,
        y: options.marginIn + solidRow * cell,
        width: best.candidate.width,
        height: best.candidate.height,
        rotationDeg: best.candidate.rotationDeg,
        outline: best.candidate.outline,
      });
      placed = true;
    }

    if (!placed) unplaced.push(unit);
  }

  return { sheetsUsed: sheets.length, placements, unplaced };
}

/**
 * Rank a nest: fewest parts left over, then fewest sheets, then the tightest
 * layout. The last term is what decides between runs that use the same
 * material, it is why a queue of two parts comes out interlocked rather than
 * sitting side by side with a wedge of sheet between them.
 */
function nestScore(result: NestResult) {
  let spread = 0;
  for (const placement of result.placements) {
    spread += (placement.x + placement.width) * (placement.y + placement.height);
  }
  return [result.unplaced.length, result.sheetsUsed, spread];
}

/** Lexicographic compare of two scores: earlier terms dominate later ones. */
function isBetter(score: number[], incumbent: number[]) {
  for (let index = 0; index < score.length; index += 1) {
    if (score[index] !== incumbent[index]) return score[index] < incumbent[index];
  }
  return false;
}

/**
 * Nest onto inventory first, then onto fresh stock.
 *
 * `stock` is consumed in the order given, so the caller decides the policy,
 * passing part-used sheets smallest-area-first spends offcuts before breaking
 * into a full sheet, which is what keeps a rack from filling with remnants.
 * Once inventory runs out, fresh sheets are opened without limit.
 */
export type NestOptions = { marginIn: number; gapIn: number; rotations?: number[]; allowInsideHoles: boolean };
export function nestOntoStock(parts: NestPart[], stock: NestStock[], fresh: NestStock, overrides: Partial<NestOptions> = {}): NestResult {
  const options: NestOptions = {marginIn: MARGIN_IN, gapIn: GAP_IN, allowInsideHoles: true, ...overrides};
  const largestEdge = Math.max(
    fresh.widthIn,
    fresh.heightIn, ...stock.flatMap((sheet) => [sheet.widthIn, sheet.heightIn]));

  // Biggest first: large pieces need the open sheet, and the gaps they leave
  // are what the smaller ones then nest into.
  const units = parts
    .flatMap((part) => Array.from({ length: part.quantity }, () => part))
    .sort((a, b) => b.widthIn * b.heightIn - a.widthIn * a.heightIn);

  /*
   * Nested twice, at the fine cell and at the coarse one, keeping whichever
   * needs fewer sheets. The fine cell nearly always wins, but on the odd set
   * of parts the coarse one packs a sheet tighter, and keeping the better
   * means no order needs more sheets, or pays more setup, than it did when
   * the coarse cell was all there was.
   */
  let best: NestResult | null = null;
  let bestScore: number[] | null = null;
  for (const cell of [Math.max(options.gapIn / CELLS_PER_GAP, largestEdge / MAX_GRID), largestEdge / COARSE_GRID]) {
    const result = nestAtCell(units, stock, fresh, cell, options);
    const score = nestScore(result);
    if (!bestScore || isBetter(score, bestScore)) {
      best = result;
      bestScore = score;
    }
  }
  return best!;
}

/**
 * Every unit, at one cell size. One size for every sheet in the run: part
 * masks are rasterised once and must line up with whichever sheet they are
 * tested against.
 */
function nestAtCell(units: NestPart[], stock: NestStock[], fresh: NestStock, cell: number, options: NestOptions): NestResult {
  const marginCells = Math.ceil(options.marginIn / cell);
  // Rounded up, so the gap is never less than GAP_IN; the allowance stops a
  // float like 3.0000000000000004 from rounding up to a whole extra cell.
  const gapCells = Math.max(1, Math.ceil(options.gapIn / cell - 1e-9));

  const freshCols = Math.floor(fresh.widthIn / cell) - marginCells * 2;
  const freshRows = Math.floor(fresh.heightIn / cell) - marginCells * 2;
  if (freshCols <= 0 || freshRows <= 0) return { sheetsUsed: 0, placements: [], unplaced: units };

  /*
   * Every unit is nested. This used to stop at MAX_UNITS and drop the rest
   * without a word: no placement, not even an entry in `unplaced`, so pieces
   * past the limit were missing from the page, from the sheet DXF and from any
   * count of sheets, with nothing on screen to say so. A long run is now packed
   * a pass at a time. Each pass gets the stock the earlier passes never opened,
   * then fresh sheets numbered on from theirs, so the placements read exactly
   * as if a single pass had made them.
   */
  const combined: NestResult = { sheetsUsed: 0, placements: [], unplaced: [] };
  let stockLeft = stock;
  let freshOpened = 0;
  for (let start = 0; start < units.length; start += MAX_UNITS) {
    const pass = bestPack(units.slice(start, start + MAX_UNITS), cell, stockLeft, fresh, gapCells, options);
    for (const placement of pass.placements) {
      combined.placements.push({
        ...placement,
        sheetIndex: placement.sheetIndex + combined.sheetsUsed,
        sheetId: renumberFresh(placement.sheetId, fresh.id, freshOpened),
      });
    }
    combined.unplaced.push(...pass.unplaced);
    // A pass opens stock before fresh sheets, so its first sheets are stock.
    const stockOpened = Math.min(pass.sheetsUsed, stockLeft.length);
    stockLeft = stockLeft.slice(stockOpened);
    freshOpened += pass.sheetsUsed - stockOpened;
    combined.sheetsUsed += pass.sheetsUsed;
  }
  return combined;
}

/** One pass: every strategy on the same units, keeping the best result. */
function bestPack(units: NestPart[], cell: number, stock: NestStock[], fresh: NestStock, gapCells: number, options: NestOptions): NestResult {
  let best: NestResult | null = null;
  let bestScore: number[] | null = null;
  // A long queue is already slow to pack once; trying every strategy on it
  // would put seconds onto the page render for a marginal density gain.
  const strategies = units.length > MULTI_STRATEGY_LIMIT ? STRATEGIES.slice(0, 1) : STRATEGIES;
  for (const strategy of strategies) {
    const result = packWith({...strategy, rotations: options.rotations ?? strategy.rotations}, units, cell, stock, fresh, gapCells, options);
    const score = nestScore(result);
    if (!bestScore || isBetter(score, bestScore)) {
      best = result;
      bestScore = score;
    }
  }
  return best!;
}

/**
 * A later pass numbers its fresh sheets from 1 again; move them on past the
 * ones earlier passes opened so every fresh sheet keeps a distinct id.
 */
function renumberFresh(sheetId: string, freshId: string, alreadyOpened: number) {
  if (!alreadyOpened || !sheetId.startsWith(`${freshId}-`)) return sheetId;
  return `${freshId}-${Number(sheetId.slice(freshId.length + 1)) + alreadyOpened}`;
}

/** Nest onto fresh stock only, no inventory involved. */
export function nestParts(parts: NestPart[], sheetWidthIn: number, sheetHeightIn: number, options: Partial<NestOptions> = {}): NestResult {
  return nestOntoStock(parts, [], { id: "new", widthIn: sheetWidthIn, heightIn: sheetHeightIn }, options);
}

/**
 * One path per part: every loop in a single `d` so `evenodd` renders interior
 * loops as holes rather than as filled islands on top of the part.
 */
export function outlinePathData(outline: NestOutline) {
  return outline
    .map((points) => `M${points.map((point) => `${point.x.toFixed(4)} ${point.y.toFixed(4)}`).join("L")}Z`)
    .join("");
}

/**
 * Map a placement into SVG space. Placements are y-up from the sheet's bottom
 * edge; SVG is y-down from its top, so the flip has to be about the SHEET, not
 * about the part.
 *
 * Using `placement.y + placement.height` instead looks right for a single part
 * and is badly wrong for a layout: it offsets every part by its own height, so
 * parts that share a sheet edge come out aligned by their tops instead. Two
 * disjoint parts of different heights then render overlapping, a phantom
 * collision that no amount of fixing the packer will remove.
 *
 * Rotation is already baked into the placement's outline, so there is none to
 * apply here.
 */
export function outlineTransform(placement: Pick<NestPlacement, "x" | "y">, sheetHeightIn: number) {
  return `matrix(1 0 0 -1 ${placement.x} ${sheetHeightIn - placement.y})`;
}

/** Where a placement's centre lands in SVG space, for labelling. */
export function placementCentre(placement: Pick<NestPlacement, "x" | "y" | "width" | "height">, sheetHeightIn: number) {
  return { x: placement.x + placement.width / 2, y: sheetHeightIn - (placement.y + placement.height / 2) };
}
