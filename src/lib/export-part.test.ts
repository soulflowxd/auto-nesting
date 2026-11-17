import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { exportPartDxf } from './export-sheet';
import { analyzeDxf } from './reference/geometry/analyze-dxf';
import { fixturePart } from './test-fixtures';

it('exports a STEP part with its outer contour and hole before nesting',()=>{
  const {filename,dxf}=exportPartDxf('hood plate.step',fixturePart().analysis);
  const imported=analyzeDxf(dxf);
  expect(filename).toBe('hood plate.dxf');
  expect(imported.closedLoopCount).toBe(2);
  expect(imported.boundingBox.width).toBeCloseTo(2);
  expect(imported.boundingBox.height).toBeCloseTo(1);
  expect(dxf).toContain('CUT-OUTSIDE');
  expect(dxf).toContain('CUT-HOLES');
  expect(dxf).not.toContain('SHEET-DATUM');
});

it('exports an imported DXF with distinct outside and hole colors',()=>{
  const source=readFileSync(new URL('../../public/samples/bearing-plate.dxf',import.meta.url),'utf8');
  const analysis=analyzeDxf(source);
  const {filename,dxf}=exportPartDxf('bearing-plate.dxf',analysis);
  const parsed=new DxfParser().parseSync(dxf)!;
  expect(filename).toBe('bearing-plate.dxf');
  expect(analyzeDxf(dxf).closedLoopCount).toBe(analysis.closedLoopCount);
  expect(parsed.header.$INSUNITS).toBe(1);
  expect(parsed.entities.filter(entity=>entity.layer==='CUT-OUTSIDE').length).toBeGreaterThan(0);
  expect(parsed.entities.filter(entity=>entity.layer==='CUT-HOLES').length).toBeGreaterThan(0);
  expect(parsed.tables.layer.layers['CUT-OUTSIDE'].colorIndex).toBe(5);
  expect(parsed.tables.layer.layers['CUT-HOLES'].colorIndex).toBe(1);
});
