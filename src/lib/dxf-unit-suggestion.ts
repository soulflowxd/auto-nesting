import type { GeometryAnalysis, UnitOverride } from './reference/geometry/types';

/** Size clues are only suggestions; the user must select the drawing unit. */
export function suggestDxfUnit(analysis:GeometryAnalysis):{unit:UnitOverride;reason:string}|null {
  const {width,height}=analysis.boundingBox;
  if(analysis.sourceUnit==='in'&&Math.min(width,height)>=100) {
    return {unit:'mm',reason:'This part appears unusually large in inches. It may have been exported in millimeters.'};
  }
  if(analysis.sourceUnit==='mm'&&Math.max(width,height)<=15/25.4) {
    return {unit:'in',reason:'This part appears unusually small in millimeters. It may have been exported in inches.'};
  }
  return null;
}
