// Contorno de servicio de un umbral a partir de la grilla de radiales. Módulo puro.
// En cada radial se toma el punto más lejano donde el valor llega al umbral: si la señal cae
// detrás de un cerro y vuelve a aparecer más lejos, cuenta hasta allá. Luego cada radial toma la
// mediana de los alcances a ±2° a su alrededor, para que un cerro suelto no dibuje un pico.

import { destinationPoint, type LonLat } from '../geo/geodesy';
import type { CoverageGrid } from './computeCoverage';
import { pointDistanceM, radialBearingDeg, type RadialPlan } from './radials';

/** Media ventana del suavizado (grados): con 1.800 radiales, 10 a cada lado, mediana de 21. */
export const CONTOUR_SMOOTHING_DEG = 2;

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

/** Mediana de cada valor con sus `half` vecinos a cada lado; la lista da la vuelta (el radial 0 sigue al último). */
export function circularMedian(values: Float64Array, half: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const window = new Float64Array(2 * half + 1);
  for (let i = 0; i < n; i++) {
    for (let k = -half; k <= half; k++) window[k + half] = values[(((i + k) % n) + n) % n]!;
    window.sort();
    out[i] = window[half]!;
  }
  return out;
}

/**
 * Línea cerrada del contorno: un vértice por radial, desde el norte en sentido horario, y vuelta
 * al primero. Cada alcance es la mediana de los radiales a ±`smoothingDeg` (0: sin suavizar).
 */
export function contourRing(
  plan: RadialPlan,
  grid: CoverageGrid,
  offsetDb: number,
  thresholdDb: number,
  smoothingDeg = CONTOUR_SMOOTHING_DEG,
): LonLat[] {
  const half = Math.round((smoothingDeg * plan.radialCount) / 360);
  const reach = circularMedian(farthestReachM(plan, grid, offsetDb, thresholdDb), half);
  const ring = Array.from(reach, (d, r) => destinationPoint(plan.site, radialBearingDeg(plan, r), d));
  ring.push(ring[0]!);
  return ring;
}
