import { describe, expect, it } from 'vitest';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round1 } from './units';

describe('units', () => {
  it('round-trips kg <-> lb', () => {
    expect(round1(kgToLb(100))).toBe(220.5);
    expect(round1(lbToKg(220.5))).toBe(100);
  });

  it('converts cm to feet/inches', () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inch: 11 });
  });

  it('round-trips ft/in -> cm', () => {
    expect(Math.round(ftInToCm(5, 11))).toBe(180);
  });
});
