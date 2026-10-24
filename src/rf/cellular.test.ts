import { describe, expect, it } from 'vitest';
import {
  angleDiffDeg,
  hataInRange,
  hataLossDb,
  noisePerResourceElementDbm,
  powerPerResourceElementDbm,
  sectorGainDbi,
  sinrDb,
  umaNlosLossDb,
} from './cellular';

describe('Okumura-Hata: 900 MHz, base 30 m, móvil 1,5 m', () => {
  // log 900 = 2,954243; a(hm) = (1,1·2,954243 − 0,7)·1,5 − (1,56·2,954243 − 0,8) = 0,015882.
  // L(1 km) = 69,55 + 26,16·2,954243 − 13,82·log 30 − 0,015882 = 69,55 + 77,28300 − 20,41382 − 0,01588 = 126,403 dB.
  it('urbano, ciudad mediana, 1 km: 126,40 dB', () => {
    expect(hataLossDb(900, 30, 1.5, 1, 'urbano')).toBeCloseTo(126.403, 2);
  });

  // A 10 km se suma (44,9 − 6,55·log 30)·1 = 35,225 dB → 161,628 dB.
  it('urbano, 10 km: 161,63 dB', () => {
    expect(hataLossDb(900, 30, 1.5, 10, 'urbano')).toBeCloseTo(161.628, 2);
  });

  // Ciudad grande, f ≥ 400 MHz: a(hm) = 3,2·(log 17,625)² − 4,97 = −0,000918 → 126,420 dB.
  it('urbano, ciudad grande, 1 km: 126,42 dB', () => {
    expect(hataLossDb(900, 30, 1.5, 1, 'urbano-grande')).toBeCloseTo(126.42, 2);
  });

  // Suburbano: − 2·(log(900/28))² − 5,4 = − 4,5426 − 5,4 → 116,461 dB.
  it('suburbano, 1 km: 116,46 dB', () => {
    expect(hataLossDb(900, 30, 1.5, 1, 'suburbano')).toBeCloseTo(116.461, 2);
  });

  // Rural: − 4,78·(2,954243)² + 18,33·2,954243 − 40,94 = − 41,7177 + 54,1513 − 40,94 → 97,897 dB.
  it('rural, 1 km: 97,90 dB', () => {
    expect(hataLossDb(900, 30, 1.5, 1, 'rural')).toBeCloseTo(97.897, 2);
  });
});

describe('COST-231 Hata: 1800 MHz, base 30 m, móvil 1,5 m, 1 km', () => {
  // log 1800 = 3,255273; a(hm) ciudad mediana = 0,042974.
  // L = 46,3 + 33,9·3,255273 − 20,41382 − 0,042974 = 136,197 dB.
  // Ciudad grande: a(hm) = 3,2·(log 17,625)² − 4,97 = −0,000919 y + 3 dB (Cm):
  // 46,3 + 110,35375 − 20,41382 + 0,000919 + 3 = 139,241 dB.
  it('urbano: 136,20 dB; ciudad grande: 139,24 dB', () => {
    expect(hataLossDb(1800, 30, 1.5, 1, 'urbano')).toBeCloseTo(136.197, 2);
    expect(hataLossDb(1800, 30, 1.5, 1, 'urbano-grande')).toBeCloseTo(139.241, 2);
  });

  it('rango de validez: 2600 MHz o 500 m quedan fuera', () => {
    expect(hataInRange(1800, 30, 1)).toBe(true);
    expect(hataInRange(2600, 30, 1)).toBe(false);
    expect(hataInRange(900, 30, 0.5)).toBe(false);
  });
});

describe('3GPP 38.901 UMa: 3,5 GHz, base 25 m, móvil 1,5 m, 1 km', () => {
  // d3D = √(1000² + 23,5²) = 1000,276 m. NLOS: 13,54 + 39,08·3,000120 + 20·log 3,5 = 141,666 dB.
  // LOS: punto de quiebre 4·24·0,5·3,5 GHz / c = 560 m; más allá:
  // 28 + 40·3,000120 + 10,881 − 9·log(560² + 23,5²) = 109,41 dB. Se toma el mayor: 141,67 dB.
  it('sin línea de vista: 141,67 dB', () => {
    expect(umaNlosLossDb(3500, 25, 1.5, 1000)).toBeCloseTo(141.666, 2);
  });
});

describe('antena sectorial (65° horizontal, 7° vertical, 17 dBi, inclinación 6°)', () => {
  const antenna = { gainDbi: 17, horizontalBeamwidthDeg: 65, verticalBeamwidthDeg: 7, downtiltDeg: 6 };

  it('en el eje y a 6° bajo el horizonte: 17 dBi', () => {
    expect(sectorGainDbi(antenna, 0, 6)).toBeCloseTo(17, 10);
  });

  it('a 32,5° del eje (medio ancho de haz): −3 dB → 14 dBi', () => {
    expect(sectorGainDbi(antenna, 32.5, 6)).toBeCloseTo(14, 10);
  });

  it('a 60° del eje: −12·(60/65)² = −10,22 dB → 6,78 dBi', () => {
    expect(sectorGainDbi(antenna, 60, 6)).toBeCloseTo(6.775, 3);
  });

  it('detrás de la antena: tope de 25 dB → −8 dBi', () => {
    expect(sectorGainDbi(antenna, 180, 6)).toBeCloseTo(-8, 10);
  });

  it('en el horizonte (0°), 6° por encima del haz: −12·(6/7)² = −8,82 dB', () => {
    expect(sectorGainDbi(antenna, 0, 0)).toBeCloseTo(17 - 8.816, 3);
  });

  it('diferencia angular: de 350° a 10° hay 20°', () => {
    expect(angleDiffDeg(10, 350)).toBeCloseTo(20, 10);
    expect(angleDiffDeg(350, 10)).toBeCloseTo(-20, 10);
  });
});

describe('LTE / NR', () => {
  // 40 W = 46,02 dBm repartidos en 100 bloques × 12 = 1200 subportadoras: − 30,79 dB → 15,23 dBm.
  it('40 W en LTE 20 MHz: 15,23 dBm por elemento de recurso', () => {
    expect(powerPerResourceElementDbm(46.0206, 100)).toBeCloseTo(15.229, 3);
  });

  // −174 + 10·log 15 000 + 7 = −174 + 41,761 + 7 = −125,24 dBm.
  it('ruido por elemento de 15 kHz con figura de ruido 7 dB: −125,24 dBm', () => {
    expect(noisePerResourceElementDbm(15, 7)).toBeCloseTo(-125.239, 3);
  });

  // Servidor −80 dBm, interferente −90 dBm, ruido −125,24 dBm:
  // I + N = 10·log(10^−9 + 10^−12,524) = −89,9987 dBm → SINR = 9,9987 dB.
  it('servidor −80 dBm con un interferente de −90 dBm: SINR ≈ 10 dB', () => {
    expect(sinrDb(-80, [-90], -125.24)).toBeCloseTo(9.9987, 3);
  });

  it('sin interferentes, la SINR es la relación señal a ruido', () => {
    expect(sinrDb(-100, [], -125.24)).toBeCloseTo(25.24, 6);
  });
});
