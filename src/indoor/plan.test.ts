import { describe, expect, it } from 'vitest';
import {
  computeHeatmaps,
  coverageFraction,
  distanceToSegment,
  heatmapCellM,
  signalsAt,
  snap,
  type FloorPlan,
  type LinkRadio,
} from './plan';
import { PLAN_PRESETS } from './presets';

describe('mapa de calor', () => {
  // Plano de 10 × 4 m con un AP en (1, 2) de 20 dBm + 3 dBi, un muro de concreto en x = 5 y espacio vacío.
  // Cliente de 15 dBm con antena de 0 dBi, canal de 20 MHz.
  const plan: FloorPlan = {
    widthM: 10,
    heightM: 4,
    walls: [{ id: 'w', x1: 5, y1: 0, x2: 5, y2: 4, material: 'concreto' }],
    aps: [{ id: 'a', name: 'AP', x: 1, y: 2, powerDbm: 20, gainDbi: 3 }],
    furniture: 'vacio',
  };
  const radio: LinkRadio = { clientPowerDbm: 15, channelWidthMHz: 20 };
  const maps = computeHeatmaps(plan, '2.4', radio);
  const map = maps.down;

  it('celdas de 10 cm: 100 columnas × 40 filas', () => {
    expect(heatmapCellM(plan)).toBe(0.1);
    expect(map.cols).toBe(100);
    expect(map.rows).toBe(40);
  });

  // Celda de (3,95, 1,95) m: a √(2,95² + 0,05²) = 2,9504 m del AP, sin muros.
  // Espacio libre: 32,45 + 67,736 + 20·log 0,0029504 = 49,580 dB → 23 − 49,58 = −26,58 dBm.
  it('a 2,95 m sin muros: −26,58 dBm', () => {
    expect(map.rssiDbm[19 * 100 + 39]).toBeCloseTo(-26.58, 1);
  });

  // Celda de (6,05, 1,95) m: 5,0502 m y atraviesa el concreto (15 dB a 2,4 GHz):
  // 32,45 + 67,736 + 20·log 0,0050502 = 54,25 dB + 15 = 69,25 dB → 23 − 69,25 = −46,25 dBm.
  // El muro se cruza casi de frente (cos θ = 5,05 / 5,0502): el factor de ángulo suma solo 0,001 dB.
  it('a 5,05 m detrás del muro de concreto: −46,25 dBm', () => {
    expect(map.rssiDbm[19 * 100 + 60]).toBeCloseTo(-46.25, 1);
  });

  // Subida: 15 dBm del cliente + 3 dBi del AP − pérdida = 5 dB menos que la bajada (23 dBm de PIRE).
  it('subida a 2,95 m: 15 + 3 − 49,58 = −31,58 dBm; detrás del muro: −51,25 dBm', () => {
    expect(maps.up.rssiDbm[19 * 100 + 39]).toBeCloseTo(-31.58, 1);
    expect(maps.up.rssiDbm[19 * 100 + 60]).toBeCloseTo(-51.25, 1);
  });

  it('el peor de los dos sentidos es la subida', () => {
    expect(maps.worst.rssiDbm[19 * 100 + 39]).toBeCloseTo(-31.58, 1);
  });

  // 6 GHz a 20 MHz: la PIRE del AP (23 dBm) se recorta a 5 + 10·log 20 = 18,01 dBm y la del cliente
  // (15 dBm) a −1 + 10·log 20 = 12,01 dBm. Espacio libre a 2,9504 m y 6175 MHz: 57,66 dB.
  it('6 GHz a 20 MHz con límite LPI: bajada 18,01 − 57,66 = −39,65 dBm y subida 12,01 + 3 − 57,66 = −42,65 dBm', () => {
    const six = computeHeatmaps(plan, '6', radio);
    expect(six.down.rssiDbm[19 * 100 + 39]).toBeCloseTo(-39.65, 1);
    expect(six.up.rssiDbm[19 * 100 + 39]).toBeCloseTo(-42.65, 1);
  });

  // Con oficina con puestos (n = 2,6) a 2,9504 m se suman 6·log 2,9504 = 2,82 dB: −26,58 − 2,82 = −29,40 dBm.
  it('con oficina con puestos, a 2,95 m la bajada baja 2,82 dB: −29,40 dBm', () => {
    const office = computeHeatmaps({ ...plan, furniture: 'oficina' }, '2.4', radio);
    expect(office.down.rssiDbm[19 * 100 + 39]).toBeCloseTo(-29.4, 1);
  });

  it('el mejor AP es el único que hay', () => {
    expect(map.bestAp[0]).toBe(0);
  });

  it('todo el plano supera −67 dBm de bajada (la señal más baja está en la esquina lejana)', () => {
    expect(coverageFraction(map, -67)).toBe(1);
  });
});

describe('mejor AP en cada sentido', () => {
  // AP 1 en (0,0): 26 dBm con 0 dBi. AP 2 en (6,0): 10 dBm con 6 dBi. Punto en (4,0), espacio vacío, 2,4 GHz.
  // Pérdidas: a 4 m 32,45 + 67,737 − 47,959 = 52,23 dB; a 2 m 46,21 dB. Cliente de 15 dBm.
  // AP 1: bajada 26 − 52,23 = −26,23; subida 15 + 0 − 52,23 = −37,23 dBm.
  // AP 2: bajada 16 − 46,21 = −30,21; subida 15 + 6 − 46,21 = −25,21 dBm.
  // Bajada: gana el AP 1. Subida y peor de los dos (−30,21 contra −37,23): gana el AP 2.
  const plan: FloorPlan = {
    widthM: 8,
    heightM: 2,
    walls: [],
    aps: [
      { id: 'a1', name: 'AP 1', x: 0, y: 0, powerDbm: 26, gainDbi: 0 },
      { id: 'a2', name: 'AP 2', x: 6, y: 0, powerDbm: 10, gainDbi: 6 },
    ],
    furniture: 'vacio',
  };
  const radio: LinkRadio = { clientPowerDbm: 15, channelWidthMHz: 20 };

  it('en (4, 0): AP 1 −26,23 / −37,23 dBm y AP 2 −30,21 / −25,21 dBm (bajada / subida)', () => {
    const [ap1, ap2] = signalsAt(plan, '2.4', radio, 4, 0);
    expect(ap1!.signals.down).toBeCloseTo(-26.23, 2);
    expect(ap1!.signals.up).toBeCloseTo(-37.23, 2);
    expect(ap2!.signals.down).toBeCloseTo(-30.21, 2);
    expect(ap2!.signals.up).toBeCloseTo(-25.21, 2);
    expect(ap2!.signals.worst).toBeCloseTo(-30.21, 2);
  });

  // Celda de (3,95, 0,05): casi el mismo punto, con las mismas conclusiones.
  it('en el mapa, el mejor AP cambia con el sentido: bajada AP 1, subida y peor AP 2', () => {
    const maps = computeHeatmaps(plan, '2.4', radio);
    const i = 39;
    expect(maps.down.bestAp[i]).toBe(0);
    expect(maps.up.bestAp[i]).toBe(1);
    expect(maps.worst.bestAp[i]).toBe(1);
  });
});

describe('utilidades del editor', () => {
  it('ajuste a la grilla de 25 cm: 3,37 → 3,25 y 3,40 → 3,5', () => {
    expect(snap(3.37, 0.25)).toBeCloseTo(3.25, 10);
    expect(snap(3.4, 0.25)).toBeCloseTo(3.5, 10);
  });

  it('distancia de (2, 3) al muro de (0,0) a (4,0): 3 m', () => {
    expect(distanceToSegment(2, 3, { x1: 0, y1: 0, x2: 4, y2: 0 })).toBeCloseTo(3, 10);
  });

  it('los planos de ejemplo tienen muros dentro de sus límites y al menos un AP', () => {
    for (const preset of PLAN_PRESETS.filter((p) => p.id !== 'blanco')) {
      const plan = preset.build();
      expect(plan.aps.length).toBeGreaterThan(0);
      for (const w of plan.walls) {
        for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]] as const) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(plan.widthM);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(plan.heightM);
        }
      }
    }
  });
});
