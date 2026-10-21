/**
 * Whether the stock a customer selected differs from the thickness their file
 * was drawn at.
 *
 * This used to allow a 12% tolerance, on the theory that a part drawn at a
 * nominal imperial thickness and cut from the nearest metric sheet was "the
 * same thing". It is not. We stock metric sheet and cut it to size; we do not
 * convert a part to imperial stock. So a plate drawn at 1/4 in (6.35 mm) cut
 * from 6 mm arrives 0.35 mm thin, 1/8 in (3.175 mm) from 3 mm arrives 0.175 mm
 * thin, and 1/16 in (1.5875 mm) from 1.75 mm arrives 0.1625 mm THICK. Those are
 * the three cases the tolerance was hiding, and they are exactly the cases a
 * customer needs told: they decide whether a press fit still presses, whether a
 * stack of plates still clears, and whether a fastener still seats.
 *
 * So any real difference warns. The customer is not blocked, only informed, and
 * the outline is cut the same either way.
 */

/**
 * Below this, a difference is measurement noise from the STEP analyser rather
 * than a different sheet. Ten microns is two orders of magnitude finer than the
 * smallest gap that matters here (1/16 in against 1.75 mm is 0.1625 mm), so it
 * separates float noise from a genuine mismatch without ever masking one.
 */
const MEASUREMENT_NOISE_MM = 0.01;

export function thicknessMismatch(importedThicknessMm: number | null | undefined, selectedThicknessMm: number) {
  if (!importedThicknessMm || importedThicknessMm <= 0) return false;
  if (!Number.isFinite(selectedThicknessMm) || selectedThicknessMm <= 0) return false;
  return Math.abs(importedThicknessMm - selectedThicknessMm) > MEASUREMENT_NOISE_MM;
}

/**
 * The stocked option closest to the thickness a file was drawn at.
 *
 * This is what a part should OPEN on, and it is a separate question from
 * whether to warn. The two used to be the same call: the picker chose the first
 * stock inside the tolerance, so anything it selected was by definition not
 * worth mentioning. Now that any real difference warns, the opening selection
 * still has to be the nearest sheet, and the warning explains the gap.
 *
 * Ties go to the thicker option: a part that comes out slightly proud can be
 * sanded or shimmed, one that comes out thin cannot be added to.
 */
export function nearestStockThickness<T extends { thicknessMm: number }>(
  importedThicknessMm: number | null | undefined,
  options: readonly T[],
): T | undefined {
  if (!options.length) return undefined;
  if (!importedThicknessMm || importedThicknessMm <= 0) return undefined;

  let best: T | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const option of options) {
    if (!Number.isFinite(option.thicknessMm) || option.thicknessMm <= 0) continue;
    const gap = Math.abs(option.thicknessMm - importedThicknessMm);
    if (gap < bestGap || (gap === bestGap && best && option.thicknessMm > best.thicknessMm)) {
      best = option;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Which way the selected stock differs, for copy that tells the customer what
 * they will actually receive. `null` when there is nothing to report.
 */
export function thicknessDelta(importedThicknessMm: number | null | undefined, selectedThicknessMm: number) {
  if (!thicknessMismatch(importedThicknessMm, selectedThicknessMm)) return null;
  const imported = importedThicknessMm as number;
  const differenceMm = selectedThicknessMm - imported;
  return {
    importedMm: imported,
    selectedMm: selectedThicknessMm,
    differenceMm,
    direction: differenceMm > 0 ? ("thicker" as const) : ("thinner" as const),
  };
}
