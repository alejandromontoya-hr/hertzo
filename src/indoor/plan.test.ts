import { describe, expect, it } from 'vitest';
import { computeHeatmap, coverageFraction, distanceToSegment, heatmapCellM, snap, type FloorPlan } from './plan';
import { PLAN_PRESETS } from './presets';

describe('mapa de calor', () => {
  // Plano de 10 × 4 m con un AP en (1, 2) de 20 dBm + 3 dBi y un muro de concreto en x = 5.
  const plan: FloorPlan = {
    widthM: 10,
    heightM: 4,
    walls: [{ id: 'w', x1: 5, y1: 0, x2: 5, y2: 4, material: 'concreto' }],
    aps: [{ id: 'a', name: 'AP', x: 1, y: 2, powerDbm: 20, gainDbi: 3 }],
  };
  const map = computeHeatmap(plan, '2.4');

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
  it('a 5,05 m detrás del muro de concreto: −46,25 dBm', () => {
    expect(map.rssiDbm[19 * 100 + 60]).toBeCloseTo(-46.25, 1);
  });

  it('el mejor AP es el único que hay', () => {
    expect(map.bestAp[0]).toBe(0);
  });

  it('todo el plano supera −67 dBm (la señal más baja está en la esquina lejana)', () => {
    expect(coverageFraction(map, -67)).toBe(1);
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
