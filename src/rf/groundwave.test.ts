import { describe, expect, it } from 'vitest';
import {
  GROUND_TYPES,
  faddeeva,
  flatEarthLimitKm,
  groundAttenuationDb,
  groundwaveRangeKm,
  nortonAttenuation,
  residueSeriesAttenuation,
  type GroundType,
} from './groundwave';

const ground = (id: string) => GROUND_TYPES.find((g) => g.id === id)!;

describe('función de Faddeeva', () => {
  // Sobre el eje real, w(x) = e^(−x²) + i·(2/√π)·D(x), con D la integral de Dawson:
  // D(1) = 0,5380795 → w(1) = 0,3678794 + 0,6071577i; D(5) = 0,1021341 → Im w(5) = 0,1152493.
  it('w(1) = 0,36788 + 0,60716i y w(5) ≈ 0 + 0,11525i', () => {
    const w1 = faddeeva({ re: 1, im: 0 });
    expect(w1.re).toBeCloseTo(0.3678794, 6);
    expect(w1.im).toBeCloseTo(0.6071577, 6);
    expect(faddeeva({ re: 5, im: 0 }).im).toBeCloseTo(0.1152493, 5);
  });
});

describe('Norton exacto (Tierra plana)', () => {
  // Roca (0,1 mS/m, εr 3), 1 MHz, 10 km: εc = 3 − 1,79875i; |Δ²| = |εc − 1| / |εc|² = 2,6899 / 12,2355 = 0,21985;
  // |w| = (π·10 000 / 299,79)·0,21985 = 23,04. Lejos, |F| → 1/(2|w|) = 0,0217 (exacto: 0,02209).
  it('roca, 1 MHz, 10 km: |w| = 23,04 y |F| ≈ 1/(2|w|)', () => {
    const n = nortonAttenuation(10000, 1, ground('roca'));
    expect(n.p).toBeCloseTo(23.04, 1);
    expect(n.attenuation).toBeCloseTo(1 / (2 * n.p), 2);
    expect(n.attenuation).toBeCloseTo(0.02209, 4);
  });

  // Mar, 1 MHz, 100 km: |Δ²| ≈ 1/|εc| = 1/√(70² + 89 938²) = 1,1119·10⁻⁵; |w| = 1047,9·1,1119·10⁻⁵ = 0,01165.
  // Con |w| tan chico el suelo casi no atenúa: |F| = 0,99494 (−0,04 dB).
  it('mar, 1 MHz, 100 km: |w| = 0,01165 y |F| = 0,9949', () => {
    const n = nortonAttenuation(100000, 1, ground('mar'));
    expect(n.p).toBeCloseTo(0.01165, 4);
    expect(n.attenuation).toBeCloseTo(0.99494, 4);
  });
});

describe('Tierra esférica (serie de residuos de Wait) contra el LFMF de NTIA', () => {
  // Vectores de https://github.com/NTIA/LFMF-test-data (LFMF_Examples.csv), polarización vertical,
  // ε 15, σ 5 mS/m; monopolo corto de 4,77 dBi: E = √(30·P·G)/d·|W|. Radio efectivo con la
  // refractividad Ns del caso: a = 6370 km / (1 − 0,04665·e^(0,005577·Ns)).
  const lfmfGround: GroundType = { id: 'lfmf', label: 'LFMF', sigmaSm: 0.005, epsilonR: 15 };
  const radius = (ns: number) => 6370e3 / (1 - 0.04665 * Math.exp(0.005577 * ns));
  const field = (watts: number, km: number, w: number) => 20 * Math.log10((Math.sqrt(30 * watts * 10 ** 0.477) / (km * 1000)) * 1e6 * w);

  it('1 MHz, 5 kW, 5000 km, Ns 301: −387,5 dBµV/m', () => {
    expect(field(5000, 5000, residueSeriesAttenuation(5000e3, 1, lfmfGround, radius(301)))).toBeCloseTo(-387.5, 0);
  });

  it('450 kHz, 1 kW, 3000 km, Ns 315: −129,3 dBµV/m', () => {
    expect(field(1000, 3000, residueSeriesAttenuation(3000e3, 0.45, lfmfGround, radius(315)))).toBeCloseTo(-129.3, 0);
  });
});

describe('paso de Tierra plana a esférica', () => {
  it('a 1 MHz sobre tierra media la curvatura resta 1,3 dB a 100 km y 4,4 dB a 200 km', () => {
    const g = ground('media');
    const flat = (km: number) => 20 * Math.log10(nortonAttenuation(km * 1000, 1, g).attenuation);
    expect(flat(100) - groundAttenuationDb(100e3, 1, g)).toBeCloseTo(1.35, 1);
    expect(flat(200) - groundAttenuationDb(200e3, 1, g)).toBeCloseTo(4.43, 1);
  });

  it('el campo no salta en los bordes de la mezcla (0,4 y 0,6 del límite)', () => {
    const g = ground('seca');
    for (const fraction of [0.4, 0.6]) {
      const m = fraction * flatEarthLimitKm(1) * 1000;
      expect(Math.abs(groundAttenuationDb(m - 1, 1, g) - groundAttenuationDb(m + 1, 1, g))).toBeLessThan(0.01);
    }
  });

  // Emisora por omisión: 10 kW, monopolo de λ/4 (5,15 dBi), 1000 kHz, tierra media.
  // Con Tierra plana (Terman) los contornos de 54 y 48 dBµV/m llegaban a 84,1 y 115,7 km.
  it('emisora de 10 kW en 1000 kHz: 54 dBµV/m a 75,1 km y 48 dBµV/m a 101,0 km', () => {
    const eirp = 70 + 5.15;
    expect(groundwaveRangeKm(eirp, 1, ground('media'), 54)).toBeCloseTo(75.1, 0);
    expect(groundwaveRangeKm(eirp, 1, ground('media'), 48)).toBeCloseTo(101.0, 0);
  });
});
