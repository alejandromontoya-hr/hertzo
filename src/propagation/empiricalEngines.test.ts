import { describe, expect, it } from 'vitest';
import { hataLossDb } from '../rf/cellular';
import { EMPIRICAL_WARN_OUT_OF_RANGE, createHataEngine, createUmaEngine, effectiveHeightM } from './empiricalEngines';

/** Radial de 20 km con muestras cada 100 m sobre un terreno dado. */
const radial = (height: (km: number) => number, txHeightM = 30) => ({
  elevationsM: Float32Array.from({ length: 201 }, (_, i) => height(i / 10)),
  stepM: 100,
  txHeightM,
  rxHeightM: 1.5,
  frequencyMHz: 900,
  stride: 10,
});

describe('altura efectiva', () => {
  it('terreno plano: la altura de la antena (30 m)', () => {
    expect(effectiveHeightM(radial(() => 1500))).toBeCloseTo(30, 6);
  });

  it('sitio en un cerro 200 m sobre el promedio de 3 a 15 km: 30 + 200 = 230 m', () => {
    expect(effectiveHeightM(radial((km) => (km < 1 ? 1700 : 1500)))).toBeCloseTo(230, 6);
  });

  it('sitio en un valle 50 m bajo el entorno: se usa la altura de la torre (30 m)', () => {
    expect(effectiveHeightM(radial((km) => (km < 1 ? 1450 : 1500)))).toBe(30);
  });

  it('torre de 5 m en un valle: se sube al mínimo de 10 m', () => {
    expect(effectiveHeightM(radial((km) => (km < 1 ? 1450 : 1500), 5))).toBe(10);
  });
});

describe('motor Hata', () => {
  // Teléfono a 30 m: Hata se ajustó de 1 a 10 m y a(30) quitaría ~24 dB de más a 5 km. Se calcula
  // con 10 m (129,2 dB a 850 MHz en ciudad mediana, no los 105 dB del espacio libre) y se raya.
  it('teléfono a 30 m: se calcula con 10 m y se marca fuera de rango', () => {
    const r = { ...radial(() => 1500), rxHeightM: 30 };
    const { lossDb, warnings } = createHataEngine('urbano').radialLoss(r);
    // stride 10 con muestras cada 100 m: el punto 4 está a 5 km.
    expect(lossDb[4]).toBeCloseTo(hataLossDb(900, 30, 10, 5, 'urbano'), 4);
    expect(warnings[4]).toBe(EMPIRICAL_WARN_OUT_OF_RANGE);
  });

  it('teléfono a 1,5 m a 5 km: dentro de rango, sin rayar', () => {
    expect(createHataEngine('urbano').radialLoss(radial(() => 1500)).warnings[4]).toBe(0);
  });

  it('en terreno plano coincide con la fórmula urbana: 1 km → 126,40 dB', () => {
    const { lossDb } = createHataEngine('urbano').radialLoss(radial(() => 1500));
    // stride 10 con muestras cada 100 m: el punto 0 está a 1 km.
    expect(lossDb[0]).toBeCloseTo(hataLossDb(900, 30, 1.5, 1, 'urbano'), 4);
    expect(lossDb[0]).toBeCloseTo(126.403, 2);
  });

  it('a 1 km está dentro de rango; con base de 30 m también a 20 km', () => {
    const { warnings } = createHataEngine('urbano').radialLoss(radial(() => 1500));
    expect(warnings[0]).toBe(0);
    expect(warnings[19]).toBe(0);
  });

  it('bajo 0,5 km se marca fuera de rango; entre 0,5 y 1 km se extrapola sin marcar', () => {
    // stride 3 con muestras cada 100 m: puntos a 0,3, 0,6, 0,9… km.
    const { warnings } = createHataEngine('urbano').radialLoss({ ...radial(() => 1500), stride: 3 });
    expect(warnings[0]).toBe(EMPIRICAL_WARN_OUT_OF_RANGE);
    expect(warnings[1]).toBe(0);
  });
});

describe('motor 3GPP UMa', () => {
  it('más allá de 5 km marca fuera de rango', () => {
    const { warnings } = createUmaEngine().radialLoss({ ...radial(() => 0, 25), frequencyMHz: 3500 });
    expect(warnings[4]).toBe(0); // 5 km
    expect(warnings[5]).toBe(EMPIRICAL_WARN_OUT_OF_RANGE); // 6 km
  });
});
