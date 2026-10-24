// Valor de cada píxel de la imagen a partir de la grilla de radiales. Módulo puro.

import type { CoverageGrid } from './computeCoverage';
import type { RasterGeometry } from './raster';

/**
 * Valor por píxel = `offsetDb` − pérdida + ganancia opcional del píxel (patrón de antena).
 * Fuera del círculo o donde el motor no calculó queda NaN.
 */
export function gridValues(
  geometry: RasterGeometry,
  grid: CoverageGrid,
  offsetDb: number,
  out: Float32Array,
  gainAt?: (pixel: number) => number,
): void {
  for (let p = 0; p < geometry.index.length; p++) {
    const g = geometry.index[p]!;
    out[p] = g < 0 ? Number.NaN : offsetDb - grid.lossDb[g]! + (gainAt ? gainAt(p) : 0);
  }
}

/** Marca los píxeles donde alguna grilla tiene la bandera de baja confianza del motor. */
export function lowConfidencePixels(
  geometry: RasterGeometry,
  grids: readonly CoverageGrid[],
  mask: number,
  out: Uint8Array,
): void {
  for (let p = 0; p < geometry.index.length; p++) {
    const g = geometry.index[p]!;
    let flagged = 0;
    if (g >= 0 && mask) {
      for (const grid of grids) {
        if (grid.warnings[g]! & mask) {
          flagged = 1;
          break;
        }
      }
    }
    out[p] = flagged;
  }
}

/** Área (km²) que cubre cada franja: píxeles con valor ≥ cada umbral (umbrales de mayor a menor). */
export function areaAboveKm2(values: Float32Array, thresholds: readonly number[], pixelAreaKm2: number): number[] {
  const sorted = [...thresholds].sort((a, b) => b - a);
  const counts = sorted.map(() => 0);
  for (const v of values) {
    for (let i = 0; i < sorted.length; i++) {
      if (v >= sorted[i]!) counts[i]!++;
    }
  }
  return counts.map((c) => c * pixelAreaKm2);
}

/** Área de un píxel (km²): la imagen es cuadrada y cubre 2·radio de lado. */
export function pixelAreaKm2(geometry: RasterGeometry, radiusM: number): number {
  const sideKm = (2 * radiusM) / 1000 / geometry.width;
  return sideKm * sideKm;
}
