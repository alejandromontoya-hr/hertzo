import { describe, expect, it } from 'vitest';
import { materialById, multiWallLossDb, segmentsCross } from './indoor';

describe('cruce de segmentos', () => {
  const wall = { x1: 5, y1: 0, x2: 5, y2: 10 };

  it('de (0,5) a (10,5) cruza un muro vertical en x = 5', () => {
    expect(segmentsCross(0, 5, 10, 5, wall)).toBe(true);
  });

  it('de (0,5) a (4,5) no llega al muro', () => {
    expect(segmentsCross(0, 5, 4, 5, wall)).toBe(false);
  });

  it('una línea paralela al muro no lo cruza', () => {
    expect(segmentsCross(4, 0, 4, 10, wall)).toBe(false);
  });

  it('pasar por encima del extremo del muro (y = 11) no lo cruza', () => {
    expect(segmentsCross(0, 11, 10, 11, wall)).toBe(false);
  });
});

describe('modelo multipared', () => {
  const walls = [
    { x1: 5, y1: 0, x2: 5, y2: 10, material: 'ladrillo' as const },
    { x1: 8, y1: 0, x2: 8, y2: 10, material: 'drywall' as const },
  ];

  // Espacio libre a 10 m y 2437 MHz: 32,45 + 20·log 2437 + 20·log 0,01 = 32,45 + 67,736 − 40 = 60,19 dB.
  it('sin muros, 10 m a 2,4 GHz: 60,19 dB de espacio libre', () => {
    const r = multiWallLossDb(0, 5, 10, 5, [], '2.4', 2437);
    expect(r.lossDb).toBeCloseTo(60.186, 2);
    expect(r.wallsCrossed).toBe(0);
  });

  // Cruza ladrillo (8 dB) y drywall (3 dB) a 2,4 GHz: 60,19 + 11 = 71,19 dB.
  it('10 m cruzando ladrillo y drywall a 2,4 GHz: 71,19 dB', () => {
    const r = multiWallLossDb(0, 5, 10, 5, walls, '2.4', 2437);
    expect(r.lossDb).toBeCloseTo(71.186, 2);
    expect(r.wallsCrossed).toBe(2);
  });

  // A 5 GHz (5500 MHz): espacio libre 32,45 + 74,807 − 40 = 67,26 dB; muros 12 + 4 = 16 dB → 83,26 dB.
  it('lo mismo a 5 GHz: 83,26 dB (el ladrillo pesa más en 5 GHz)', () => {
    expect(multiWallLossDb(0, 5, 10, 5, walls, '5', 5500).lossDb).toBeCloseTo(83.257, 2);
  });

  // Más cerca de 1 m se usa la pérdida a 1 m: 32,45 + 67,736 − 60 = 40,19 dB.
  it('a 0,3 m del AP se toma la pérdida a 1 m: 40,19 dB', () => {
    expect(multiWallLossDb(0, 0, 0.3, 0, [], '2.4', 2437).lossDb).toBeCloseTo(40.186, 2);
  });

  it('el concreto atenúa más que el drywall en todas las bandas', () => {
    for (const band of ['2.4', '5', '6'] as const) {
      expect(materialById('concreto').lossDb[band]).toBeGreaterThan(materialById('drywall').lossDb[band]);
    }
  });
});
