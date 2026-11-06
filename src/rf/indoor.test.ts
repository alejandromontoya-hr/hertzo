import { describe, expect, it } from 'vitest';
import {
  MCS0_SENSITIVITY_DBM,
  effectiveEirpDbm,
  eirpLimitDbm,
  furnitureById,
  furnitureExcessDb,
  materialById,
  multiWallLossDb,
  segmentsCross,
  wallIncidenceFactor,
} from './indoor';

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

describe('ángulo con que se cruza un muro', () => {
  // Muro vertical de (0,0) a (0,10): su normal es el eje x. Factor = min(1/cos θ, 2).
  const wall = { x1: 0, y1: 0, x2: 0, y2: 10 };

  it('de frente (0°): factor 1/cos 0° = 1', () => {
    expect(wallIncidenceFactor(1, 0, wall)).toBeCloseTo(1, 10);
  });

  it('a 45°: factor 1/cos 45° = 1,4142', () => {
    expect(wallIncidenceFactor(1, 1, wall)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('a 60°: factor 1/cos 60° = 2', () => {
    expect(wallIncidenceFactor(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3), wall)).toBeCloseTo(2, 10);
  });

  it('a 70°: 1/cos 70° = 2,92, pero el tope lo deja en 2', () => {
    const t = (70 * Math.PI) / 180;
    expect(wallIncidenceFactor(Math.cos(t), Math.sin(t), wall)).toBe(2);
  });

  // AP en (0,0) y punto a 12 m a 60° de la normal: (6; 10,392). Cruza concreto en x = 5.
  // Espacio libre a 5500 MHz: 32,45 + 74,807 + 20·log 0,012 (−38,416) = 68,841 dB.
  // Concreto a 5 GHz: 22 dB × 2 = 44 dB → 112,84 dB (antes 68,84 + 22 = 90,84 dB).
  it('concreto a 60° en 5 GHz, 12 m: 68,84 + 22 × 2 = 112,84 dB', () => {
    const concrete = [{ x1: 5, y1: -20, x2: 5, y2: 20, material: 'concreto' as const }];
    const t = Math.PI / 3;
    const r = multiWallLossDb(0, 0, 12 * Math.cos(t), 12 * Math.sin(t), concrete, '5', 5500);
    expect(r.lossDb).toBeCloseTo(112.841, 2);
  });
});

describe('mobiliario y personas', () => {
  // Exceso = 10·(n − 2)·log10(d / 1 m).
  it('oficina con puestos (n = 2,6) a 30 m: 6 · log 30 = 8,86 dB', () => {
    expect(furnitureExcessDb(30, furnitureById('oficina').exponent)).toBeCloseTo(8.863, 2);
  });

  it('casa amueblada (n = 2,4) a 10 m: 4 · log 10 = 4 dB', () => {
    expect(furnitureExcessDb(10, furnitureById('casa').exponent)).toBeCloseTo(4, 10);
  });

  it('espacio vacío (n = 2) no suma nada, y a menos de 1 m tampoco', () => {
    expect(furnitureExcessDb(30, furnitureById('vacio').exponent)).toBe(0);
    expect(furnitureExcessDb(0.5, 2.6)).toBe(0);
  });

  // Oficina abierta, 30 m a 2437 MHz: espacio libre 32,45 + 67,737 − 30,458 = 69,73 dB + 8,86 = 78,59 dB.
  // La ITU-R P.1238 (N = 30) da 20·log 2437 + 30·log 30 − 28 = 84,05 dB, pero ese N ya incluye los muros.
  it('oficina abierta a 30 m y 2,4 GHz sin muros: 69,73 + 8,86 = 78,59 dB', () => {
    expect(multiWallLossDb(0, 0, 30, 0, [], '2.4', 2437, 2.6).lossDb).toBeCloseTo(78.592, 2);
  });
});

describe('límites de potencia y sensibilidad', () => {
  // 6 GHz LPI: AP 5 dBm/MHz y cliente −1 dBm/MHz; PIRE = densidad + 10·log10(ancho).
  it('AP en 6 GHz: 18,01 dBm a 20 MHz, 21,02 a 40, 24,03 a 80 y 27,04 a 160', () => {
    expect(eirpLimitDbm('6', 20, 'ap')).toBeCloseTo(18.0103, 3);
    expect(eirpLimitDbm('6', 40, 'ap')).toBeCloseTo(21.0206, 3);
    expect(eirpLimitDbm('6', 80, 'ap')).toBeCloseTo(24.0309, 3);
    expect(eirpLimitDbm('6', 160, 'ap')).toBeCloseTo(27.0412, 3);
  });

  it('cliente en 6 GHz a 20 MHz: −1 + 13,01 = 12,01 dBm', () => {
    expect(eirpLimitDbm('6', 20, 'client')).toBeCloseTo(12.0103, 3);
  });

  it('en 2,4 y 5 GHz no se revisa límite', () => {
    expect(eirpLimitDbm('2.4', 20, 'ap')).toBeNull();
    expect(eirpLimitDbm('5', 80, 'ap')).toBeNull();
  });

  it('20 dBm + 3 dBi = 23 dBm en 6 GHz a 20 MHz se recorta a 18,01 dBm; a 80 MHz queda en 23', () => {
    expect(effectiveEirpDbm(23, eirpLimitDbm('6', 20, 'ap'))).toBeCloseTo(18.0103, 3);
    expect(effectiveEirpDbm(23, eirpLimitDbm('6', 80, 'ap'))).toBe(23);
    expect(effectiveEirpDbm(23, null)).toBe(23);
  });

  it('sensibilidad en MCS0: 3 dB peor cada vez que se duplica el canal (−82, −79, −76, −73 dBm)', () => {
    expect(([20, 40, 80, 160] as const).map((w) => MCS0_SENSITIVITY_DBM[w])).toEqual([-82, -79, -76, -73]);
  });
});
