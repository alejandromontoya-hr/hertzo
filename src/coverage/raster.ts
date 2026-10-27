// Paso de la grilla de radiales a una imagen sobre el mapa (Web Mercator) o para Google Earth. Módulo puro.

import { distanceM, initialBearingDeg, type LonLat } from '../geo/geodesy';
import { circleBounds, type RadialPlan } from './radials';

/** Tamaño de píxel de la imagen de cobertura (m). */
export const RASTER_PIXEL_M = 100;

/** Lado máximo de la imagen (píxeles); radios grandes usan píxeles más grandes. */
export const MAX_RASTER_SIZE = 1200;

export interface RasterGeometry {
  width: number;
  height: number;
  /** Esquinas para MapLibre: noroeste, noreste, sureste, suroeste. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  /** Para cada píxel, fila por fila: índice en la grilla de radiales, o −1 fuera del círculo. */
  index: Int32Array;
  /** Rumbo desde el sitio hasta cada píxel (grados desde el norte). */
  bearingDeg: Float32Array;
  /** Distancia del sitio a cada píxel (m). */
  distanceM: Float32Array;
}

/** Índice en la grilla (radial · puntos + punto) del punto calculado más cercano, o −1 si está fuera del radio. */
export function gridIndexAt(plan: RadialPlan, point: LonLat): number {
  return gridIndexFor(plan, distanceM(plan.site, point), initialBearingDeg(plan.site, point));
}

/** Igual que `gridIndexAt`, a partir de la distancia (m) y el rumbo (grados) desde el sitio. */
export function gridIndexFor(plan: RadialPlan, d: number, bearingDeg: number): number {
  if (d > plan.radiusM) return -1;
  const radial = Math.round((bearingDeg * plan.radialCount) / 360) % plan.radialCount;
  const spacing = plan.stride * plan.stepM;
  const k = Math.min(plan.pointsPerRadial - 1, Math.max(0, Math.round(d / spacing) - 1));
  return radial * plan.pointsPerRadial + k;
}

const mercatorY = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
const latFromMercatorY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

/**
 * Cómo se reparten las filas entre el norte y el sur: `mercator` para el mapa de MapLibre;
 * `geographic`, en grados de latitud parejos, para Google Earth (KML).
 */
export type RasterRows = 'mercator' | 'geographic';

export function buildRasterGeometry(plan: RadialPlan, rows: RasterRows = 'mercator'): RasterGeometry {
  const bounds = circleBounds(plan.site, plan.radiusM);
  const pixelM = Math.max(RASTER_PIXEL_M, (2 * plan.radiusM) / MAX_RASTER_SIZE);
  const size = Math.ceil((2 * plan.radiusM) / pixelM);
  const yNorth = mercatorY(bounds.north);
  const ySouth = mercatorY(bounds.south);
  /** Latitud de la fila a una fracción `f` del camino del norte (0) al sur (1). */
  const latAt =
    rows === 'mercator'
      ? (f: number) => latFromMercatorY(yNorth + f * (ySouth - yNorth))
      : (f: number) => bounds.north + f * (bounds.south - bounds.north);
  const index = new Int32Array(size * size);
  const bearings = new Float32Array(size * size);
  const distances = new Float32Array(size * size);

  for (let row = 0; row < size; row++) {
    const lat = latAt((row + 0.5) / size);
    for (let col = 0; col < size; col++) {
      const lon = bounds.west + ((col + 0.5) / size) * (bounds.east - bounds.west);
      const p = row * size + col;
      const point = { lon, lat };
      distances[p] = distanceM(plan.site, point);
      bearings[p] = initialBearingDeg(plan.site, point);
      index[p] = gridIndexFor(plan, distances[p]!, bearings[p]!);
    }
  }

  return {
    width: size,
    height: size,
    coordinates: [
      [bounds.west, bounds.north],
      [bounds.east, bounds.north],
      [bounds.east, bounds.south],
      [bounds.west, bounds.south],
    ],
    index,
    bearingDeg: bearings,
    distanceM: distances,
  };
}
