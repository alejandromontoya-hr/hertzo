import { describe, expect, it } from 'vitest';
import { destinationPoint, distanceM } from '../geo/geodesy';
import { clearanceProfile } from '../rf/pointToPoint';
import type { TerrainProfile } from '../terrain/profile';
import { linkRayPath } from './linkPath';

// Enlace de 10 km hacia el este sobre terreno plano a 0 m, antenas de 30 m en A y en B,
// muestras cada 1 km (11 muestras).
const from = { lon: -75.6853, lat: 6.2794 };
const to = destinationPoint(from, 90, 10000);
const profile: TerrainProfile = {
  from,
  to,
  distanceM: 10000,
  stepM: 1000,
  distancesM: Float64Array.from({ length: 11 }, (_, i) => i * 1000),
  elevationsM: new Float32Array(11),
};
const pointsFor = (kFactor: number) =>
  clearanceProfile({ profile, heightAM: 30, heightBM: 30, frequencyMHz: 11000, kFactor });

describe('linkRayPath', () => {
  it('los extremos quedan a la cota más la altura de la antena: 30 m', () => {
    const ray = linkRayPath(profile, pointsFor(4 / 3));
    expect(ray[0]!.altitudeM).toBeCloseTo(30, 6);
    expect(ray[10]!.altitudeM).toBeCloseTo(30, 6);
  });

  it('con k = 4/3, a mitad de camino el rayo baja 5000·5000 / (2·4/3·6.371.000) = 1,47 m: queda a 28,53 m', () => {
    expect(linkRayPath(profile, pointsFor(4 / 3))[5]!.altitudeM).toBeCloseTo(28.528, 3);
  });

  it('con k = 1 baja más: 25.000.000 / 12.742.000 = 1,96 m, queda a 28,04 m', () => {
    expect(linkRayPath(profile, pointsFor(1))[5]!.altitudeM).toBeCloseTo(28.038, 3);
  });

  it('cada punto está sobre la línea A–B, a la distancia de su muestra', () => {
    const ray = linkRayPath(profile, pointsFor(4 / 3));
    expect(distanceM(from, ray[3]!)).toBeCloseTo(3000, 0);
    expect(distanceM(to, ray[10]!)).toBeLessThan(0.01);
  });

  it('con un máximo de 4 puntos toma 1 de cada 4 muestras (0, 4, 8) y siempre el extremo B (10)', () => {
    const ray = linkRayPath(profile, pointsFor(4 / 3), 4);
    expect(ray).toHaveLength(4);
    expect(distanceM(from, ray[2]!)).toBeCloseTo(8000, 0);
    expect(distanceM(to, ray[3]!)).toBeLessThan(0.01);
  });
});
