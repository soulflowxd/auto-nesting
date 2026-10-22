export type StockPreset = {
  id: string; material: string; color: string; thicknessMm: number;
  widthMm: number; heightMm: number; nominal?: boolean;
};

export const STOCKS: StockPreset[] = [
  ...[3, 6].map(thicknessMm => ({id: `al7075-${thicknessMm}`, material: '7075-T6 aluminum', color: 'Natural', thicknessMm, widthMm: 700, heightMm: 700})),
  ...[1.75, 3, 6].flatMap(thicknessMm => (thicknessMm===1.75?['Black']:['Black', 'White']).map(color => ({
    id: `srpp-${thicknessMm}-${color.toLowerCase()}`,
    material: thicknessMm === 6 ? 'SRPP · foam core' : 'SRPP · solid', color, thicknessMm,
    widthMm: thicknessMm === 1.75 ? 660 : 610, heightMm: thicknessMm === 1.75 ? 737 : 610,
  }))),
  {id: 'acetal-3-white', material: 'Delrin / acetal', color: 'White', thicknessMm: 3, widthMm: 600, heightMm: 600, nominal: true},
  ...[3, 6].map(thicknessMm => ({id: `pc-${thicknessMm}`, material: 'Polycarbonate', color: 'Clear', thicknessMm, widthMm: 745, heightMm: 745})),
];

/** Currently offered stock. Legacy presets remain in STOCKS so older jobs can still open. */
export const AVAILABLE_STOCKS = STOCKS.filter(stock => stock.material.startsWith('SRPP') || stock.material === 'Delrin / acetal');

export function getStock(id: string): StockPreset {
  const stock = STOCKS.find(stock => stock.id === id);
  if (!stock) throw new Error('Choose a supported material and thickness.');
  return stock;
}

/** Original woven SRPP assets from INTERNAL_SOURCE; shared by solid and foam-core stock. */
export function srppTextureUrl(stock: Pick<StockPreset, 'material' | 'color'>): string | null {
  if (!stock.material.startsWith('SRPP')) return null;
  return stock.color === 'White' ? '/materials/srpp-white.jpg' : '/materials/srpp-decal.png';
}

export const mmToIn = (mm: number) => mm / 25.4;
export const inToMm = (inches: number) => inches * 25.4;
export const number = (n: number, digits = 4) => Number(n.toFixed(digits)).toLocaleString('en-US', {maximumFractionDigits: digits});
export const dimension = (inches: number) => `${number(inches)}″ (${number(inToMm(inches), 3)} mm)`;
export const thicknessLabel = (mm: number) => dimension(mmToIn(mm));
export const stockLabel = (stock: StockPreset) => `${stock.material} · ${thicknessLabel(stock.thicknessMm)} · ${stock.color}`;

export type SheetSettings = {
  widthIn: number; heightIn: number; gapIn: number; marginIn: number;
  rotation: 'fixed' | 'quarter' | 'fine' | 'free';
};
export function defaultSettings(stock: StockPreset): SheetSettings {
  return {widthIn: mmToIn(stock.widthMm), heightIn: mmToIn(stock.heightMm), gapIn: mmToIn(1), marginIn: mmToIn(1), rotation: 'free'};
}

function rotationError(s: SheetSettings): string | null {
  if (!['fixed', 'quarter', 'fine', 'free'].includes(s.rotation)) return 'Choose a supported rotation setting.';
  return null;
}

export function rotationAngles(s: SheetSettings): number[] {
  const error = rotationError(s);
  if (error) throw new Error(error);
  if (s.rotation === 'fixed') return [0];
  // Free mode uses these only as initial seeds, then derives and refines angles
  // against geometry and live sheet collisions inside the nesting engine.
  const step = s.rotation === 'quarter' ? 90 : 30;
  return Array.from({length: 360 / step}, (_, i) => i * step);
}

export function settingsErrors(s: SheetSettings): string[] {
  const errors: string[] = [];
  if (![s.widthIn, s.heightIn, s.gapIn, s.marginIn].every(Number.isFinite)) errors.push('Use finite numeric dimensions.');
  if (s.widthIn <= 0 || s.heightIn <= 0 || s.widthIn > 240 || s.heightIn > 240) errors.push('Sheet dimensions must be greater than 0 and at most 240″ (6,096 mm).');
  if (s.gapIn < 0 || s.marginIn < 0 || s.gapIn > 12 || s.marginIn > 12) errors.push('Spacing and margin must be between 0″ (0 mm) and 12″ (304.8 mm).');
  if (s.marginIn * 2 >= Math.min(s.widthIn, s.heightIn)) errors.push('Edge margins leave no usable sheet area.');
  const angleError = rotationError(s);
  if (angleError) errors.push(angleError);
  return errors;
}
