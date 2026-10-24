import { describe, expect, it } from 'vitest';
import { distanceM } from '../geo/geodesy';
import type { TerrainSampler } from '../terrain/sampler';
import { circleBounds, planRadials, pointDistanceM, radialBearingDeg, sampleRadial } from './radials';

const site = { lon: -75.6853, lat: 6.2794 }; // Padre Amaya

describe('planRadials', () => {
  // 50 km: perímetro 2π·50 000 = 314 159 m; a 250 m como máximo entre radiales hacen falta
  // 1257, que se redondean al múltiplo de 360 siguiente: 1440 (uno cada 0,25°, 218 m en el borde).
  // Muestras: 50 000 / 30 = 1666,7 → 1667 tramos → múltiplo de 3: 1668 tramos de 29,976 m.
  // Puntos con pérdida: 1668 / 3 = 556, uno cada 89,93 m.
  it('50 km: 1440 radiales, 1669 muestras de 29,976 m y 556 puntos', () => {
    const plan = planRadials(site, 50000);
    expect(plan.radialCount).toBe(1440);
    expect(plan.samplesPerRadial).toBe(1669);
    expect(plan.stepM).toBeCloseTo(29.976, 3);
    expect(plan.pointsPerRadial).toBe(556);
  });

  // 10 km: 2π·10 000 / 250 = 251,3 → mínimo 360 radiales.
  // 10 000 / 30 = 333,3 → 334 → múltiplo de 3: 336 tramos de 29,762 m; 112 puntos.
  it('10 km: 360 radiales y 112 puntos', () => {
    const plan = planRadials(site, 10000);
    expect(plan.radialCount).toBe(360);
    expect(plan.samplesPerRadial).toBe(337);
    expect(plan.pointsPerRadial).toBe(112);
  });

  it('el último punto de cada radial cae justo en el radio', () => {
    const plan = planRadials(site, 50000);
    expect(pointDistanceM(plan, plan.pointsPerRadial - 1)).toBeCloseTo(50000, 6);
  });
});

describe('radialBearingDeg', () => {
  it('con 1440 radiales: el 0 al norte, el 360 al este y el 720 al sur', () => {
    const plan = planRadials(site, 50000);
    expect(radialBearingDeg(plan, 0)).toBe(0);
    expect(radialBearingDeg(plan, 360)).toBe(90);
    expect(radialBearingDeg(plan, 720)).toBe(180);
  });
});

describe('circleBounds', () => {
  it('cada borde del rectángulo queda a 50 km del sitio', () => {
    const b = circleBounds(site, 50000);
    expect(distanceM(site, { lon: site.lon, lat: b.north })).toBeCloseTo(50000, 3);
    expect(distanceM(site, { lon: site.lon, lat: b.south })).toBeCloseTo(50000, 3);
    expect(b.east).toBeGreaterThan(site.lon);
    expect(b.west).toBeLessThan(site.lon);
  });
});

describe('sampleRadial', () => {
  it('el radial 0 (norte) sobre una rampa de 1000 m por grado de latitud', () => {
    const ramp: TerrainSampler = { zoom: 12, heightAt: (_lon, lat) => (lat - site.lat) * 1000 };
    const plan = planRadials(site, 10000);
    const out = new Float32Array(plan.samplesPerRadial);
    sampleRadial(ramp, plan, 0, out);
    expect(out[0]).toBeCloseTo(0, 4);
    // 10 km al norte son 10 000 / 111 195 = 0,08993°: 89,93 m sobre la rampa.
    expect(out[plan.samplesPerRadial - 1]).toBeCloseTo(89.93, 1);
  });
});
