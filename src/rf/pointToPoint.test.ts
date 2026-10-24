import { describe, expect, it } from 'vitest';
import {
  clearanceProfile,
  deygoutLoss,
  earthBulgeM,
  elevationAngleDeg,
  fresnelParameterV,
  fresnelRadiusM,
  gaseousAttenuationDbPerKm,
  knifeEdgeLossDb,
  minClearance,
  multipathOutageProbability,
  parabolicGainDbi,
} from './pointToPoint';

describe('zona de Fresnel y curvatura', () => {
  // 6 GHz: λ = 0,049965 m. A mitad de 10 km: √(0,049965·5000·5000 / 10 000) = √124,91 = 11,18 m.
  it('primera zona de Fresnel a mitad de 10 km, 6 GHz: 11,18 m', () => {
    expect(fresnelRadiusM(5000, 5000, 6000)).toBeCloseTo(11.1765, 3);
  });

  it('en los extremos la zona de Fresnel mide 0', () => {
    expect(fresnelRadiusM(0, 10000, 6000)).toBe(0);
  });

  // k = 4/3: 5000·5000 / (2·4/3·6 371 000) = 25·10⁶ / 16 989 333 = 1,4715 m; a 50 km, 36,79 m.
  it('abultamiento a mitad de 10 km con k = 4/3: 1,47 m; de 50 km: 36,79 m', () => {
    expect(earthBulgeM(5000, 5000, 4 / 3)).toBeCloseTo(1.4715, 3);
    expect(earthBulgeM(25000, 25000, 4 / 3)).toBeCloseTo(36.788, 2);
  });

  it('con k = 2/3 (atmósfera desfavorable) el abultamiento se duplica', () => {
    expect(earthBulgeM(5000, 5000, 2 / 3)).toBeCloseTo(2 * 1.4715, 3);
  });
});

describe('difracción por arista (ITU-R P.526)', () => {
  // J(0) = 6,9 + 20·log(√1,01 − 0,1) = 6,9 − 0,867 = 6,03 dB: rasante, ~6 dB.
  it('obstáculo justo en la línea (v = 0): 6,03 dB', () => {
    expect(knifeEdgeLossDb(0)).toBeCloseTo(6.033, 2);
  });

  // J(2,5) = 6,9 + 20·log(√(2,4² + 1) + 2,4) = 6,9 + 20·log 5 = 20,88 dB.
  it('v = 2,5: 20,88 dB', () => {
    expect(knifeEdgeLossDb(2.5)).toBeCloseTo(20.879, 2);
  });

  it('obstáculo bien por debajo de la línea (v ≤ −0,78): 0 dB', () => {
    expect(knifeEdgeLossDb(-1)).toBe(0);
  });

  // h = 10 m a mitad de 10 km, 6 GHz: v = 10·√(2·10 000 / (0,049965·5000·5000)) = 1,2654.
  it('10 m sobre la línea a mitad de 10 km, 6 GHz: v = 1,265', () => {
    expect(fresnelParameterV(10, 5000, 5000, 6000)).toBeCloseTo(1.2654, 3);
  });
});

describe('perfil del enlace', () => {
  // 10 km sobre terreno plano a 0 m, 101 muestras cada 100 m, antenas de 10 m.
  const flat = Array.from({ length: 101 }, (_, i) => i * 100);
  const spike = flat.map((_, i) => (i === 50 ? 20 : 0));

  // Arista de 20 m a mitad de camino: 10 m sobre la línea → v = 1,2654 →
  // J = 6,9 + 20·log(√(1,16535² + 1) + 1,16535) = 6,9 + 20·log 2,70094 = 15,53 dB.
  it('Deygout con una sola arista de 10 m sobre la línea: 15,53 dB', () => {
    const result = deygoutLoss({
      profile: { distancesM: flat, elevationsM: spike },
      heightAM: 10,
      heightBM: 10,
      frequencyMHz: 6000,
      kFactor: 1e9, // sin curvatura, para aislar la arista
    });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0]!.distanceM).toBe(5000);
    expect(result.lossDb).toBeCloseTo(15.53, 2);
  });

  // Antenas de 30 m sobre terreno plano: a mitad, 30 − 1,4715 = 28,53 m de despeje, 2,55 zonas de Fresnel.
  it('despeje mínimo con antenas de 30 m en 10 km planos (6 GHz, k = 4/3): 255 % de F1 a mitad', () => {
    const points = clearanceProfile({
      profile: { distancesM: flat, elevationsM: flat.map(() => 0) },
      heightAM: 30,
      heightBM: 30,
      frequencyMHz: 6000,
      kFactor: 4 / 3,
    });
    const min = minClearance(points);
    expect(min.distanceM).toBe(5000);
    expect(min.clearanceM).toBeCloseTo(28.5285, 3);
    expect(min.ratio).toBeCloseTo(2.5525, 3);
  });
});

describe('antenas, gases y disponibilidad', () => {
  // 11 GHz: λ = 0,027254 m; π·0,6/λ = 69,163; 0,55·69,163² = 2630,9 → 34,20 dBi.
  it('parábola de 0,6 m a 11 GHz: 34,2 dBi', () => {
    expect(parabolicGainDbi(0.6, 11000)).toBeCloseTo(34.2, 1);
  });

  // Interpolación entre 22,2 GHz (0,20) y 26 GHz (0,13): 0,2 − 0,07·0,8/3,8 = 0,1853 dB/km.
  it('gases a 23 GHz: 0,185 dB/km', () => {
    expect(gaseousAttenuationDbPerKm(23000)).toBeCloseTo(0.1853, 3);
  });

  // 6·10⁻⁷ · 1 · 6 · 30³ · 10⁻³ = 9,72·10⁻⁵ → 99,9903 % de disponibilidad (~51 min al año).
  it('6 GHz, 30 km, margen 30 dB, C = 1: P = 9,72·10⁻⁵', () => {
    expect(multipathOutageProbability(6000, 30, 30, 1)).toBeCloseTo(9.72e-5, 9);
  });

  // Caída por curvatura en 10 km con k = 4/3: 10⁸ / 16 989 333 = 5,886 m → atan(−5,886/10 000) = −0,0337°.
  it('apuntamiento entre dos antenas a la misma altura a 10 km: −0,034°', () => {
    expect(elevationAngleDeg(100, 100, 10000, 4 / 3)).toBeCloseTo(-0.03372, 4);
  });
});
