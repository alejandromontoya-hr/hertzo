// Contorno de servicio de un umbral a partir de la grilla de radiales. Módulo puro.
// En cada radial, el contorno pasa por el punto más lejano donde el valor llega al umbral:
// si la señal cae detrás de un cerro y vuelve a aparecer más lejos, el contorno va hasta allá.

import { destinationPoint, type LonLat } from '../geo/geodesy';
import type { CoverageGrid } from './computeCoverage';
import { pointDistanceM, radialBearingDeg, type RadialPlan } from './radials';

/**
 * Distancia al sitio (m) del punto más lejano de cada radial con valor ≥ `thresholdDb`, donde
 * valor = `offsetDb` − pérdida (como en `gridValues`). 0 si en ese radial no llega a ninguno.
 */
export function farthestReachM(plan: RadialPlan, grid: CoverageGrid, offsetDb: number, thresholdDb: number): Float64Array {
  const reach = new Float64Array(plan.radialCount);
  for (let r = 0; r < plan.radialCount; r++) {
    const base = r * plan.pointsPerRadial;
    for (let k = plan.pointsPerRadial - 1; k >= 0; k--) {
      // Con NaN (punto sin calcular) la comparación da falso y se sigue buscando hacia adentro.
      if (offsetDb - grid.lossDb[base + k]! >= thresholdDb) {
        reach[r] = pointDistanceM(plan, k);
        break;
      }
    }
  }
  return reach;
}

/** Línea cerrada del contorno: un vértice por radial, desde el norte en sentido horario, y vuelta al primero. */
export function contourRing(plan: RadialPlan, grid: CoverageGrid, offsetDb: number, thresholdDb: number): LonLat[] {
  const reach = farthestReachM(plan, grid, offsetDb, thresholdDb);
  const ring = Array.from(reach, (d, r) => destinationPoint(plan.site, radialBearingDeg(plan, r), d));
  ring.push(ring[0]!);
  return ring;
}
