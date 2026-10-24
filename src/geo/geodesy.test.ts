import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_M,
  destinationPoint,
  distanceM,
  initialBearingDeg,
  interpolate,
} from './geodesy';

// En una esfera de radio R, un grado de arco mide R·π/180 = 6 371 008,8 · π / 180 = 111 195,08 m.
const ONE_DEGREE_M = (EARTH_RADIUS_M * Math.PI) / 180;

describe('distanceM', () => {
  it('un grado de latitud ≈ 111 195 m', () => {
    expect(ONE_DEGREE_M).toBeCloseTo(111195.08, 2);
    expect(distanceM({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(111195.08, 2);
  });

  it('un grado de longitud sobre el ecuador también ≈ 111 195 m', () => {
    expect(distanceM({ lon: -75, lat: 0 }, { lon: -74, lat: 0 })).toBeCloseTo(111195.08, 2);
  });

  it('a 60° de latitud un grado de longitud mide casi la mitad (cos 60° = 0,5)', () => {
    // Arco de círculo máximo, un poco menor que el paralelo (55 597,5 m): 55 588,1 m.
    const d = distanceM({ lon: 0, lat: 60 }, { lon: 1, lat: 60 });
    expect(d).toBeGreaterThan(55580);
    expect(d).toBeLessThan(55597.6);
  });

  it('un punto consigo mismo está a 0 m', () => {
    expect(distanceM({ lon: -75.58, lat: 6.24 }, { lon: -75.58, lat: 6.24 })).toBe(0);
  });
});

describe('initialBearingDeg', () => {
  it('hacia el norte 0°, el este 90°, el sur 180° y el oeste 270°', () => {
    const o = { lon: 0, lat: 0 };
    expect(initialBearingDeg(o, { lon: 0, lat: 1 })).toBeCloseTo(0, 9);
    expect(initialBearingDeg(o, { lon: 1, lat: 0 })).toBeCloseTo(90, 9);
    expect(initialBearingDeg(o, { lon: 0, lat: -1 })).toBeCloseTo(180, 9);
    expect(initialBearingDeg(o, { lon: -1, lat: 0 })).toBeCloseTo(270, 9);
  });
});

describe('destinationPoint', () => {
  it('111 195 m al este desde (0, 0) llega a lon 1°', () => {
    const p = destinationPoint({ lon: 0, lat: 0 }, 90, ONE_DEGREE_M);
    expect(p.lon).toBeCloseTo(1, 9);
    expect(p.lat).toBeCloseTo(0, 9);
  });

  it('111 195 m al norte desde Medellín sube 1° de latitud', () => {
    const p = destinationPoint({ lon: -75.58, lat: 6.24 }, 0, ONE_DEGREE_M);
    expect(p.lon).toBeCloseTo(-75.58, 9);
    expect(p.lat).toBeCloseTo(7.24, 9);
  });

  it('ida y vuelta: la distancia al destino es la pedida (50 km a 37°)', () => {
    const from = { lon: -75.68, lat: 6.28 };
    expect(distanceM(from, destinationPoint(from, 37, 50000))).toBeCloseTo(50000, 6);
  });
});

describe('interpolate', () => {
  it('la mitad entre lat 0° y lat 2° es lat 1°', () => {
    const p = interpolate({ lon: 0, lat: 0 }, { lon: 0, lat: 2 }, 0.5);
    expect(p.lon).toBeCloseTo(0, 9);
    expect(p.lat).toBeCloseTo(1, 9);
  });

  it('las fracciones 0 y 1 devuelven los extremos', () => {
    const a = { lon: -75.68, lat: 6.28 };
    const b = { lon: -75.2, lat: 6.6 };
    expect(interpolate(a, b, 0).lat).toBeCloseTo(a.lat, 9);
    expect(interpolate(a, b, 1).lon).toBeCloseTo(b.lon, 9);
  });

  it('un cuarto del camino queda a un cuarto de la distancia', () => {
    const a = { lon: -75.68, lat: 6.28 };
    const b = { lon: -75.2, lat: 6.6 };
    expect(distanceM(a, interpolate(a, b, 0.25))).toBeCloseTo(distanceM(a, b) / 4, 6);
  });
});
