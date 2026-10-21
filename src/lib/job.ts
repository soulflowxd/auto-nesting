import type { GeometryAnalysis } from './reference/geometry/types';
import type { NestResult } from './reference/nesting';
import { getStock, settingsErrors, type SheetSettings } from './materials';

export type JobPart = {id: string; name: string; stockId: string; quantity: number; analysis: GeometryAnalysis};
export type GroupResult = {stockId: string; settings: SheetSettings; nest: NestResult; errors: Record<number, string[]>};
export type JobDocument = {version: 1; name: string; parts: JobPart[]; settings: Record<string, SheetSettings>};
export const MAX_PROJECT_BYTES = 750 * 1024;

export function parseJob(json: string): JobDocument {
  if (new TextEncoder().encode(json).length > MAX_PROJECT_BYTES) throw new Error('Project exceeds the 750 KB limit. Split it into smaller jobs.');
  const doc = JSON.parse(json) as JobDocument;
  if (!doc || doc.version !== 1 || typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 120 || !Array.isArray(doc.parts) || doc.parts.length > 100 || !doc.settings || Array.isArray(doc.settings) || typeof doc.settings !== 'object') throw new Error('This is not a supported ITKAN Nest project.');
  const ids = new Set<string>();
  let units = 0;
  for (const part of doc.parts) {
    getStock(part.stockId);
    if (typeof part.id !== 'string' || ids.has(part.id) || !part.id || part.id.length > 100 || typeof part.name !== 'string' || !part.name.trim() || part.name.length > 255 || !Number.isInteger(part.quantity) || part.quantity < 1 || part.quantity > 500) throw new Error('Invalid part name, ID or quantity.');
    ids.add(part.id);
    units += part.quantity;
    const a = part.analysis;
    if (!a || !a.boundingBox || ![a.boundingBox.width, a.boundingBox.height, a.boundingBox.minX, a.boundingBox.minY, a.boundingBox.maxX, a.boundingBox.maxY, a.cutLengthIn].every(Number.isFinite) || a.boundingBox.width <= 0 || a.boundingBox.height <= 0 || !Array.isArray(a.loops) || !a.loops.length || a.loops.length > 256 || !Array.isArray(a.warnings) || !a.warnings.every(w => typeof w === 'string') || !['in', 'mm', 'cm', 'm', 'ft'].includes(a.sourceUnit)) throw new Error('Invalid part geometry in project.');
    if (a.sourceThicknessMm !== undefined && (!Number.isFinite(a.sourceThicknessMm) || a.sourceThicknessMm <= 0)) throw new Error('Invalid STEP thickness in project.');
    let points = 0;
    for (const loop of a.loops) {
      if (!Array.isArray(loop.points) || loop.points.length < 3 || !Number.isFinite(loop.perimeterIn)) throw new Error('Invalid cut contour in project.');
      points += loop.points.length;
      for (const p of loop.points) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) throw new Error('Invalid contour coordinates.');
    }
    if (points > 20000) throw new Error('Part exceeds the 20,000 point limit.');
  }
  if (units > 500) throw new Error('A job can contain at most 500 copies.');
  for (const [id, s] of Object.entries(doc.settings)) {
    getStock(id);
    if (!s || settingsErrors(s).length) throw new Error('Invalid sheet settings in project.');
  }
  // Results are always regenerated after opening; saved placement data is never trusted.
  return {version: 1, name: doc.name, parts: doc.parts, settings: doc.settings};
}
