// Unit conversions. The app stores body stats in metric internally; these helpers
// convert to/from imperial only for display and input.

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(totalInches / 12), inch: totalInches % 12 };
}

export function ftInToCm(ft: number, inch: number): number {
  return inchesToCm(ft * 12 + inch);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
