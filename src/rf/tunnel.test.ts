import { describe, expect, it } from 'vitest';
import {
  bendLossDb,
  breakpointDistanceM,
  cornerLoss90Db,
  cutoffFrequencyMHz,
  leakyCableLevelDbm,
  modalAttenuationDbPerM,
  rockAbsorptionDb,
  roughnessAttenuationDbPerM,
  skinDepthM,
  tunnelPathLossDb,
} from './tunnel';

const square = { widthM: 4.3, heightM: 4.3 };
const rock = { epsilonR: 5, roughnessM: 0.1 };

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
  it('curva de 90°: ~17 dB en VHF, ~25 dB a 900 MHz', () => {
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

  // δ = 503·√(100 / 1000) = 159,06 m; 300 m de roca: 8,686·300/159,06 = 16,38 dB.
  it('roca de 100 Ω·m a 1 kHz: δ = 159 m y 16,4 dB de absorción en 300 m', () => {
    expect(skinDepthM(100, 1000)).toBeCloseTo(159.06, 1);
    expect(rockAbsorptionDb(300, 100, 1000)).toBeCloseTo(16.38, 1);
  });
});
