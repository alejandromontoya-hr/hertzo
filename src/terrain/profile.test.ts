import { describe, expect, it } from 'vitest';
import type { TerrainSampler } from './sampler';
import { profileBounds, sampleProfile } from './profile';

// Terreno de prueba: una rampa que sube 1000 m por cada grado de latitud.
const ramp: TerrainSampler = { zoom: 12, heightAt: (_lon, lat) => lat * 1000 };

describe('sampleProfile', () => {
  // De lat 0° a lat 0,01°: 0,01 · 111 195,08 = 1111,95 m.
  // Con paso máximo de 100 m: ceil(11,12) = 12 tramos de 92,66 m y 13 muestras.
  const p = sampleProfile(ramp, { lon: -75, lat: 0 }, { lon: -75, lat: 0.01 }, 100);

  it('1111,95 m en 12 tramos de 92,66 m (13 muestras)', () => {
    expect(p.distanceM).toBeCloseTo(1111.95, 2);
    expect(p.distancesM.length).toBe(13);
    expect(p.stepM).toBeCloseTo(92.663, 3);
  });

  it('incluye los extremos: 0 m al inicio y 10 m al final de la rampa', () => {
    expect(p.distancesM[0]).toBe(0);
    expect(p.elevationsM[0]).toBeCloseTo(0, 4);
    expect(p.distancesM[12]).toBeCloseTo(1111.95, 2);
    expect(p.elevationsM[12]).toBeCloseTo(10, 4);
  });

  it('a mitad de camino (muestra 6) la rampa va en 5 m', () => {
    expect(p.elevationsM[6]).toBeCloseTo(5, 4);
  });

  it('dos puntos iguales dan un perfil de 2 muestras a 0 m de distancia', () => {
    const same = sampleProfile(ramp, { lon: -75, lat: 1 }, { lon: -75, lat: 1 });
    expect(same.distancesM.length).toBe(2);
    expect(same.distanceM).toBe(0);
  });
});

describe('profileBounds', () => {
  it('toma el mínimo y el máximo de cada coordenada', () => {
    expect(profileBounds({ lon: -75.2, lat: 6.6 }, { lon: -75.68, lat: 6.28 })).toEqual({
      west: -75.68,
      south: 6.28,
      east: -75.2,
      north: 6.6,
    });
  });
});
