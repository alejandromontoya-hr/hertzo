import { describe, expect, it } from 'vitest';
import { dbdToDbi, dbiToDbd, dbmToWatts, lineLossDb, wattsToDbm } from './units';

describe('wattsToDbm', () => {
  // dBm = 10·log10(P en mW)
  it('100 W = 50 dBm (10·log10(100 000))', () => {
    expect(wattsToDbm(100)).toBeCloseTo(50, 10);
  });

  it('3 W ≈ 34,77 dBm (10·log10(3000) = 34,7712)', () => {
    expect(wattsToDbm(3)).toBeCloseTo(34.7712, 4);
  });

  it('1 W = 30 dBm y 1 mW = 0 dBm', () => {
    expect(wattsToDbm(1)).toBeCloseTo(30, 10);
    expect(wattsToDbm(0.001)).toBeCloseTo(0, 10);
  });

  it('la mitad de potencia son 3 dB menos (50 W ≈ 46,99 dBm)', () => {
    expect(wattsToDbm(50)).toBeCloseTo(46.9897, 4);
  });

  it('rechaza potencias de 0 W o negativas', () => {
    expect(() => wattsToDbm(0)).toThrow(RangeError);
    expect(() => wattsToDbm(-5)).toThrow(RangeError);
  });
});

describe('dbmToWatts', () => {
  it('50 dBm = 100 W', () => {
    expect(dbmToWatts(50)).toBeCloseTo(100, 10);
  });

  it('34,8 dBm ≈ 3,02 W (10^3,48 = 3019,95 mW)', () => {
    expect(dbmToWatts(34.8)).toBeCloseTo(3.01995, 5);
  });

  it('−120 dBm = 1·10⁻¹⁵ W', () => {
    expect(dbmToWatts(-120)).toBeCloseTo(1e-15, 25);
  });
});

describe('dbdToDbi / dbiToDbd', () => {
  // Un dipolo de media onda tiene 2,15 dBi: 0 dBd = 2,15 dBi.
  it('0 dBd = 2,15 dBi', () => {
    expect(dbdToDbi(0)).toBeCloseTo(2.15, 10);
  });

  it('6 dBd = 8,15 dBi', () => {
    expect(dbdToDbi(6)).toBeCloseTo(8.15, 10);
  });

  it('una antena de portátil de −5 dBd = −2,85 dBi', () => {
    expect(dbdToDbi(-5)).toBeCloseTo(-2.85, 10);
  });

  it('8,15 dBi = 6 dBd (ida y vuelta)', () => {
    expect(dbiToDbd(8.15)).toBeCloseTo(6, 10);
  });
});

describe('lineLossDb', () => {
  it('60 m de línea a 4 dB/100 m = 2,4 dB', () => {
    expect(lineLossDb(60, 4)).toBeCloseTo(2.4, 10);
  });

  it('100 m a 1,5 dB/100 m = 1,5 dB', () => {
    expect(lineLossDb(100, 1.5)).toBeCloseTo(1.5, 10);
  });

  it('sin línea no hay pérdida', () => {
    expect(lineLossDb(0, 4)).toBe(0);
  });
});
