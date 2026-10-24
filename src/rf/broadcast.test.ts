import { describe, expect, it } from 'vitest';
import { dbuvmToMvm, erpToEirpDbm, fieldFromEirp, freeSpaceLossDb, kilowattsToDbm } from './fieldStrength';
import { GROUND_TYPES, flatEarthLimitKm, groundwaveLossDb, groundwaveRangeKm, nortonAttenuation } from './groundwave';

const ground = (id: string) => GROUND_TYPES.find((g) => g.id === id)!;

describe('espacio libre e intensidad de campo', () => {
  it('pérdida a 1 km y 100 MHz: 32,45 + 40 + 0 = 72,45 dB', () => {
    expect(freeSpaceLossDb(1, 100)).toBeCloseTo(72.45, 10);
  });

  it('1 kW = 60 dBm; ERP 60 dBm = PIRE 62,15 dBm', () => {
    expect(kilowattsToDbm(1)).toBeCloseTo(60, 10);
    expect(erpToEirpDbm(60)).toBeCloseTo(62.15, 10);
  });

  // Emisora FM de 1 kW ERP a 1 km en espacio libre: E = √(30·1000·1,64)/1000 = 0,2218 V/m = 106,9 dBµV/m.
  // Con nuestras fórmulas: 62,15 − 72,45 = −10,3 dBm; −10,3 + 40 + 77,2 = 106,9 dBµV/m.
  it('FM de 1 kW ERP a 1 km en espacio libre: 106,9 dBµV/m', () => {
    expect(fieldFromEirp(62.15, freeSpaceLossDb(1, 100), 100)).toBeCloseTo(106.9, 6);
  });

  it('60 dBµV/m = 1 mV/m; 66 dBµV/m ≈ 2 mV/m', () => {
    expect(dbuvmToMvm(60)).toBeCloseTo(1, 10);
    expect(dbuvmToMvm(66)).toBeCloseTo(1.995, 3);
  });
});

describe('onda de tierra (Sommerfeld-Norton, aproximación de Terman)', () => {
  // AM de 1 kW con monopolo corto (4,77 dBi): sin atenuación da 300 mV/m a 1 km = 109,54 dBµV/m.
  const eirpDbm = 60 + 4.77;
  const fieldAt = (km: number, mhz: number, id: string) =>
    fieldFromEirp(eirpDbm, groundwaveLossDb(km * 1000, mhz, ground(id)), mhz);

  it('referencia: 1 kW con monopolo corto, sin pérdidas de suelo, da 300 mV/m a 1 km', () => {
    expect(fieldFromEirp(eirpDbm, freeSpaceLossDb(1, 1), 1)).toBeCloseTo(109.52, 2);
  });

  // Agua de mar, 1 MHz, 100 km: x = 1,8·10⁴·5 / 1 = 90 000; b = arctan(71 / 90 000) = 0,000789 rad;
  // p = π·100 000 / (299,79·90 000) = 0,01164; A = 2,00349 / 2,01173 − 0,0000598 = 0,99585.
  it('agua de mar, 1 MHz, 100 km: A = 0,9959 y E ≈ 69,5 dBµV/m (3 mV/m)', () => {
    const n = nortonAttenuation(100000, 1, ground('mar'));
    expect(n.p).toBeCloseTo(0.011644, 5);
    expect(n.attenuation).toBeCloseTo(0.99585, 4);
    expect(fieldAt(100, 1, 'mar')).toBeCloseTo(69.48, 1);
  });

  // Tierra media (3 mS/m, εr 22), 1 MHz, 50 km: x = 54; b = arctan(23/54) = 0,40266 rad;
  // p = π·50 000 / (299,79·54)·cos b = 9,70305·0,92001 = 8,927;
  // A = 4,67807 / 58,74053 − 2,11269·e^(−5,5793)·0,39186 = 0,079640 − 0,003125 = 0,07652.
  // E = 109,52 − 20·log 50 + 20·log 0,07652 = 109,52 − 33,98 − 22,32 = 53,2 dBµV/m.
  it('tierra media, 1 MHz, 50 km: A ≈ 0,0765 y E ≈ 53,2 dBµV/m', () => {
    const n = nortonAttenuation(50000, 1, ground('media'));
    expect(n.p).toBeCloseTo(8.927, 2);
    expect(n.attenuation).toBeCloseTo(0.07652, 4);
    expect(fieldAt(50, 1, 'media')).toBeCloseTo(53.2, 1);
  });

  it('a igual distancia, el suelo seco atenúa más que el húmedo, y este más que el mar', () => {
    expect(fieldAt(50, 1, 'seca')).toBeLessThan(fieldAt(50, 1, 'humeda'));
    expect(fieldAt(50, 1, 'humeda')).toBeLessThan(fieldAt(50, 1, 'mar'));
  });

  it('a mayor frecuencia, más atenuación sobre tierra (1600 kHz contra 600 kHz a 30 km)', () => {
    expect(fieldAt(30, 1.6, 'media') - fieldAt(30, 0.6, 'media')).toBeLessThan(0);
  });

  it('la Tierra plana vale hasta ~80 km a 1 MHz y ~40 km a 8 MHz', () => {
    expect(flatEarthLimitKm(1)).toBeCloseTo(80, 10);
    expect(flatEarthLimitKm(8)).toBeCloseTo(40, 10);
  });

  it('alcance inverso: sobre el mar a 1 MHz, 69,48 dBµV/m se cumple hasta ~100 km', () => {
    expect(groundwaveRangeKm(eirpDbm, 1, ground('mar'), 69.48)).toBeCloseTo(100, 0);
  });

  it('alcance inverso: sobre tierra media a 1 MHz, 53,2 dBµV/m se cumple hasta ~50 km', () => {
    expect(groundwaveRangeKm(eirpDbm, 1, ground('media'), 53.24)).toBeCloseTo(50, 0);
  });
});
