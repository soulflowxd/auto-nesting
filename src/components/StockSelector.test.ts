import { describe, expect, it } from 'vitest';
import { choiceForMaterial } from './StockSelector';

describe('import stock defaults', () => {
  it('selects the only stocked thickness without a STEP thickness', () => {
    expect(choiceForMaterial('Delrin / acetal')).toEqual({material:'Delrin / acetal',thicknessMm:3,color:'White'});
    expect(choiceForMaterial('SRPP · foam core')).toMatchObject({thicknessMm:6,color:''});
  });

  it('selects the closest stocked thickness for a STEP part', () => {
    expect(choiceForMaterial('SRPP · solid',3.175)).toMatchObject({thicknessMm:3,color:''});
    expect(choiceForMaterial('SRPP · solid',1.8)).toMatchObject({thicknessMm:1.75,color:'Black'});
  });

  it('keeps material and thickness unselected when the file has no thickness', () => {
    expect(choiceForMaterial('SRPP · solid')).toMatchObject({thicknessMm:null,color:''});
    expect(choiceForMaterial('')).toEqual({material:'',thicknessMm:null,color:''});
    expect(choiceForMaterial('7075-T6 aluminum')).toEqual({material:'7075-T6 aluminum',thicknessMm:null,color:''});
  });
});
