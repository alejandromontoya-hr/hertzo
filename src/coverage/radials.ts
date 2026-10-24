// Geometría del cálculo de cobertura: radiales que salen del sitio. Módulo puro.

import { destinationPoint, type LonLat } from '../geo/geodesy';
import type { TerrainSampler } from '../terrain/sampler';
import type { Bounds } from '../terrain/tiles';

/** Separación máxima entre muestras de terreno de un radial (m). */
export const RADIAL_STEP_M = 30;

/** Cada cuántas muestras se calcula la pérdida: con 30 m entre muestras, un punto cada ~90 m. */
export const LOSS_STRIDE = 3;

/** Separación máxima entre radiales vecinos en el borde del círculo (m). */
export const MAX_ARC_SPACING_M = 250;

export interface RadialPlan {
  site: LonLat;
  radiusM: number;
  /** Número de radiales, múltiplo de 360. */
  radialCount: number;
  /** Muestras de terreno por radial, incluida la del sitio. */
  samplesPerRadial: number;
  /** Separación real entre muestras de terreno (m). */
  stepM: number;
  stride: number;
  /** Puntos con pérdida calculada por radial; el punto k está a (k + 1)·stride·stepM del sitio. */
  pointsPerRadial: number;
}

const roundUpTo = (value: number, multiple: number) => Math.ceil(value / multiple) * multiple;

export function planRadials(site: LonLat, radiusM: number): RadialPlan {
  const radialCount = roundUpTo(Math.max(360, Math.ceil((2 * Math.PI * radiusM) / MAX_ARC_SPACING_M)), 360);
  const intervals = roundUpTo(Math.ceil(radiusM / RADIAL_STEP_M), LOSS_STRIDE);
  return {
    site,
    radiusM,
    radialCount,
    samplesPerRadial: intervals + 1,
    stepM: radiusM / intervals,
    stride: LOSS_STRIDE,
    pointsPerRadial: intervals / LOSS_STRIDE,
  };
}

/** Rumbo del radial i en grados desde el norte; el radial 0 apunta al norte. */
export function radialBearingDeg(plan: RadialPlan, index: number): number {
  return (index * 360) / plan.radialCount;
}

/** Distancia al sitio (m) del punto k de un radial. */
export function pointDistanceM(plan: RadialPlan, point: number): number {
  return (point + 1) * plan.stride * plan.stepM;
}

/** Rectángulo que contiene el círculo de cálculo. */
export function circleBounds(site: LonLat, radiusM: number): Bounds {
  return {
    north: destinationPoint(site, 0, radiusM).lat,
    south: destinationPoint(site, 180, radiusM).lat,
    east: destinationPoint(site, 90, radiusM).lon,
    west: destinationPoint(site, 270, radiusM).lon,
  };
}

/** Escribe en `out` las cotas del radial `index`, desde el sitio hacia afuera. */
export function sampleRadial(sampler: TerrainSampler, plan: RadialPlan, index: number, out: Float32Array): void {
  const bearing = radialBearingDeg(plan, index);
  for (let i = 0; i < plan.samplesPerRadial; i++) {
    const point = destinationPoint(plan.site, bearing, i * plan.stepM);
    out[i] = sampler.heightAt(point.lon, point.lat);
  }
}
