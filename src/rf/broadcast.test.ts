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

describe('onda de tierra (Norton exacto y serie de residuos)', () => {
  // AM de 1 kW con monopolo corto (4,77 dBi): sin atenuación da 300 mV/m a 1 km = 109,54 dBµV/m.
  const eirpDbm = 60 + 4.77;
  const fieldAt = (km: number, mhz: number, id: string) =>
    fieldFromEirp(eirpDbm, groundwaveLossDb(km * 1000, mhz, ground(id)), mhz);

  it('referencia: 1 kW con monopolo corto, sin pérdidas de suelo, da 300 mV/m a 1 km', () => {
    expect(fieldFromEirp(eirpDbm, freeSpaceLossDb(1, 1), 1)).toBeCloseTo(109.52, 2);
  });

  // Tierra media (3 mS/m, εr 22), 1 MHz, 5 km: Norton exacto |F| = 0,52598 (−5,58 dB), comprobado
  // con una implementación independiente. E = 109,52 − 20·log 5 − 5,58 = 89,96 dBµV/m.
  it('tierra media, 1 MHz, 5 km: |F| = 0,526 y E ≈ 90,0 dBµV/m', () => {
    expect(nortonAttenuation(5000, 1, ground('media')).attenuation).toBeCloseTo(0.52598, 4);
    expect(fieldAt(5, 1, 'media')).toBeCloseTo(89.96, 1);
  });

  it('suelos secos con las constantes de la ITU (tabla 2 del Manual de onda de tierra, 2014)', () => {
    expect(ground('seca')).toMatchObject({ sigmaSm: 0.001, epsilonR: 15 });
    expect(ground('muy-seca')).toMatchObject({ sigmaSm: 0.0003, epsilonR: 7 });
    expect(ground('roca')).toMatchObject({ sigmaSm: 0.0001, epsilonR: 3 });
  });

  // Roca (0,1 mS/m, εr 3), 1 MHz, 10 km: |F| = 0,02209 → E = 300·0,02209/10 = 0,66 mV/m.
  it('roca, 1 MHz, 10 km: E ≈ 0,66 mV/m', () => {
    expect(dbuvmToMvm(fieldAt(10, 1, 'roca'))).toBeCloseTo(0.663, 2);
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

  it('alcance inverso: el campo en el alcance hallado es el umbral pedido', () => {
    const range = groundwaveRangeKm(eirpDbm, 1, ground('media'), 54);
    expect(fieldAt(range, 1, 'media')).toBeCloseTo(54, 2);
  });

  it('alcance inverso: sobre tierra media a 1 MHz, 89,96 dBµV/m se cumple hasta ~5 km', () => {
    expect(groundwaveRangeKm(eirpDbm, 1, ground('media'), 89.96)).toBeCloseTo(5, 1);
  });
});
