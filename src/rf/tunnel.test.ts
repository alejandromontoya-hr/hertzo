import { describe, expect, it } from 'vitest';
import {
  bendLossDb,
  breakpointDistanceM,
  cornerLoss90Db,
  cutoffFrequencyMHz,
  galleryAttenuationDbPerM,
  leakyCableLevelDbm,
  modalAttenuationDbPerM,
  rockAbsorptionDb,
  roughnessAttenuationDbPerM,
  skinDepthM,
  tiltAttenuationDbPerM,
  tunnelPathLossDb,
  typicalLeakyCable,
} from './tunnel';

const square = { widthM: 4.3, heightM: 4.3 };
const rock = { epsilonR: 5, roughnessM: 0.1, tiltDeg: 1 };

describe('atenuación modal (Emslie)', () => {
  // 900 MHz: λ = 0,33310 m, λ² = 0,110955. Galería cuadrada de 4,3 m: a³ = 79,507; √(εr − 1) = 2.
  // (1 + 5) / (79,507·2) = 0,037733 → 4,343·0,110955·0,037733 = 0,01818 dB/m (1,82 dB/100 m).
  it('900 MHz en galería de 4,3 × 4,3 m (εr = 5): 1,82 dB/100 m', () => {
    expect(modalAttenuationDbPerM(900, square, rock, 'vertical') * 100).toBeCloseTo(1.818, 2);
  });

  it('en una galería cuadrada la polarización no importa', () => {
    expect(modalAttenuationDbPerM(900, square, rock, 'horizontal')).toBeCloseTo(
      modalAttenuationDbPerM(900, square, rock, 'vertical'),
      12,
    );
  });

  it('en una galería más ancha que alta, la polarización horizontal pierde menos', () => {
    const wide = { widthM: 8, heightM: 4 };
    expect(modalAttenuationDbPerM(450, wide, rock, 'horizontal')).toBeLessThan(
      modalAttenuationDbPerM(450, wide, rock, 'vertical'),
    );
  });

  // FM a 100 MHz: λ² = 8,9875 → 81 veces más que a 900 MHz: 1,47 dB/m. La señal muere en ~100 m.
  it('FM (100 MHz) en la misma galería: 1,47 dB/m', () => {
    expect(modalAttenuationDbPerM(100, square, rock, 'vertical')).toBeCloseTo(1.4727, 3);
  });

  // Inclinación de 1° = 0,0174533 rad, θ² = 3,04617e-4; 4,343·π² = 42,8637.
  // 42,8637·3,04617e-4 / 0,33310 = 0,039198 dB/m = 1,195 dB/100 pies (NIOSH: 1,2 dB/100 pies).
  it('inclinación de 1° a 900 MHz: 4,343·π²·θ²/λ = 0,0392 dB/m (1,2 dB/100 pies, NIOSH)', () => {
    expect(tiltAttenuationDbPerM(900, 1)).toBeCloseTo(0.039198, 5);
    expect(tiltAttenuationDbPerM(900, 1) * 30.48).toBeCloseTo(1.195, 3);
  });

  // Crece con f: a 2437 MHz λ = 0,12302 m → 0,013057/0,12302 = 0,10614 dB/m (10,6 dB/100 m).
  it('inclinación de 1° a 2,4 GHz: 10,6 dB/100 m; sin inclinación, 0', () => {
    expect(tiltAttenuationDbPerM(2437, 1) * 100).toBeCloseTo(10.614, 2);
    expect(tiltAttenuationDbPerM(2437, 0)).toBe(0);
  });

  // Total en 4,3 × 4,3 m a 900 MHz: modal 0,018183 + rugosidad 0,000835 + inclinación 0,039198 = 0,058216 dB/m.
  it('atenuación total a 900 MHz: modal + rugosidad + inclinación = 5,82 dB/100 m', () => {
    expect(galleryAttenuationDbPerM(900, square, rock, 'vertical') * 100).toBeCloseTo(5.822, 2);
  });

  // Rugosidad de 0,1 m: 4,343·π²·0,01·0,3331·(2 / 341,88) = 0,000835 dB/m.
  it('rugosidad de 10 cm a 900 MHz: 0,08 dB/100 m', () => {
    expect(roughnessAttenuationDbPerM(900, square, 0.1) * 100).toBeCloseTo(0.0835, 3);
  });
});

describe('modelo de dos tramos', () => {
  // máx(a², b²)/λ = 18,49 / 0,3331 = 55,5 m.
  it('distancia de quiebre a 900 MHz en 4,3 m: 55,5 m', () => {
    expect(breakpointDistanceM(900, square)).toBeCloseTo(55.51, 1);
  });

  // c / (2·4,3) = 34,86 MHz.
  it('frecuencia de corte práctica de una galería de 4,3 m: 34,9 MHz', () => {
    expect(cutoffFrequencyMHz(square)).toBeCloseTo(34.86, 1);
  });

  // Hasta el quiebre, espacio libre: a 50 m y 900 MHz = 32,45 + 59,085 − 26,021 = 65,51 dB.
  it('a 50 m (antes del quiebre) es espacio libre: 65,51 dB', () => {
    expect(tunnelPathLossDb(50, 900, 0.02, 55.5)).toBeCloseTo(65.51, 1);
  });

  // A 555,5 m: espacio libre a 55,5 m (66,43 dB) + 0,02 dB/m · 500 m = 76,43 dB.
  it('a 555,5 m: 66,43 + 0,02·500 = 76,43 dB', () => {
    expect(tunnelPathLossDb(555.5, 900, 0.02, 55.5)).toBeCloseTo(76.43, 1);
  });
});

describe('curvas, cable radiante y roca', () => {
  // Constante empírica (sin fuente medida): 15 + 10·log(f/100).
  it('curva de 90° (empírica): 15 + 10·log(f/100) = 16,8 dB en 150 MHz y 24,5 dB a 900 MHz', () => {
    expect(cornerLoss90Db(150)).toBeCloseTo(16.76, 1);
    expect(cornerLoss90Db(900)).toBeCloseTo(24.54, 1);
  });

  it('una curva de 45° pierde la mitad que una de 90°', () => {
    expect(bendLossDb(45, 24)).toBeCloseTo(12, 10);
  });

  // 30 dBm − 3,6·300/100 − 70 − 20·log(4/2) = 30 − 10,8 − 70 − 6,02 = −56,82 dBm.
  it('cable radiante UHF a 300 m de la cabecera y 4 m del cable: −56,8 dBm', () => {
    expect(leakyCableLevelDbm(30, { longitudinalDbPer100m: 3.6, couplingLossDb: 70 }, 300, 4)).toBeCloseTo(-56.82, 2);
  });

  // Puntos de la hoja del RFS RLKW12-50: 450 MHz → 5,74 dB/100 m y 62 dB; 900 MHz → 8,63 y 66.
  it('cable de 1/2" en los puntos de la hoja RFS RLKW12-50: 450 y 900 MHz', () => {
    expect(typicalLeakyCable(450)).toEqual({ longitudinalDbPer100m: 5.74, couplingLossDb: 62 });
    expect(typicalLeakyCable(900).longitudinalDbPer100m).toBeCloseTo(8.63, 10);
    expect(typicalLeakyCable(900).couplingLossDb).toBeCloseTo(66, 10);
  });

  // Entre 450 y 800 MHz contra log(f): t = ln(460/450)/ln(800/450) = 0,038199.
  // 5,74 + 0,038199·(7,89 − 5,74) = 5,8221 dB/100 m; acople 62 + 0,038199·1 = 62,038 dB.
  it('cable de 1/2" a 460 MHz (interpolado): 5,82 dB/100 m y 62,04 dB', () => {
    const c = typicalLeakyCable(460);
    expect(c.longitudinalDbPer100m).toBeCloseTo(5.8221, 3);
    expect(c.couplingLossDb).toBeCloseTo(62.038, 2);
  });

  // 1 km de cable a 460 MHz con 33 dBm en la cabecera, a 2 m: 33 − 58,221 − 62,038 = −87,26 dBm.
  it('1 km de cable a 460 MHz con 33 dBm: −87,3 dBm a 2 m del cable', () => {
    expect(leakyCableLevelDbm(33, typicalLeakyCable(460), 1000, 2)).toBeCloseTo(-87.26, 1);
  });

  // Fuera de la hoja (>1900 MHz) se prolonga la pendiente 1800–1900 MHz:
  // t = ln(2437/1800)/ln(1900/1800) = 5,6036 → 20,6 + 5,6036·1,02 = 26,32 dB/100 m; acople fijo en 62 dB.
  it('cable de 1/2" a 2437 MHz (estimado fuera de la hoja): 26,3 dB/100 m y 62 dB', () => {
    expect(typicalLeakyCable(2437).longitudinalDbPer100m).toBeCloseTo(26.32, 1);
    expect(typicalLeakyCable(2437).couplingLossDb).toBe(62);
  });

  // Por debajo de 75 MHz, pérdida del cobre ∝ √f: 2,17·√(30/75) = 1,372 dB/100 m; acople el de 75 MHz.
  it('cable de 1/2" a 30 MHz: 2,17·√(30/75) = 1,37 dB/100 m y 56 dB', () => {
    expect(typicalLeakyCable(30).longitudinalDbPer100m).toBeCloseTo(1.372, 3);
    expect(typicalLeakyCable(30).couplingLossDb).toBe(56);
  });

  // δ = 503·√(100 / 1000) = 159,06 m; 300 m de roca: 8,686·300/159,06 = 16,38 dB.
  it('roca de 100 Ω·m a 1 kHz: δ = 159 m y 16,4 dB de absorción en 300 m', () => {
    expect(skinDepthM(100, 1000)).toBeCloseTo(159.06, 1);
    expect(rockAbsorptionDb(300, 100, 1000)).toBeCloseTo(16.38, 1);
  });
});
