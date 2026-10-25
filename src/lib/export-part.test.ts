import { expect, it } from 'vitest';
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
