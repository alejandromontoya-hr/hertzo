// Paso de la grilla de radiales a una imagen sobre el mapa (Web Mercator). Módulo puro.

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
}

/** Índice en la grilla (radial · puntos + punto) del punto calculado más cercano, o −1 si está fuera del radio. */
export function gridIndexAt(plan: RadialPlan, point: LonLat): number {
  const d = distanceM(plan.site, point);
  if (d > plan.radiusM) return -1;
  const radial = Math.round((initialBearingDeg(plan.site, point) * plan.radialCount) / 360) % plan.radialCount;
  const spacing = plan.stride * plan.stepM;
  const k = Math.min(plan.pointsPerRadial - 1, Math.max(0, Math.round(d / spacing) - 1));
  return radial * plan.pointsPerRadial + k;
}

const mercatorY = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
const latFromMercatorY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

export function buildRasterGeometry(plan: RadialPlan): RasterGeometry {
  const bounds = circleBounds(plan.site, plan.radiusM);
  const pixelM = Math.max(RASTER_PIXEL_M, (2 * plan.radiusM) / MAX_RASTER_SIZE);
  const size = Math.ceil((2 * plan.radiusM) / pixelM);
  const yNorth = mercatorY(bounds.north);
  const ySouth = mercatorY(bounds.south);
  const index = new Int32Array(size * size);

  for (let row = 0; row < size; row++) {
    const lat = latFromMercatorY(yNorth + ((row + 0.5) / size) * (ySouth - yNorth));
    for (let col = 0; col < size; col++) {
      const lon = bounds.west + ((col + 0.5) / size) * (bounds.east - bounds.west);
      index[row * size + col] = gridIndexAt(plan, { lon, lat });
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
  };
}
