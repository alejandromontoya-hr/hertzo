// Mapa de SF de LoRa: en cada punto, el factor de dispersión más rápido con el que el gateway
// todavía oye al sensor. Módulo puro: se vuelve a pintar sin correr el motor de propagación.

import { receivedPowerDbm, type LinkBudget } from '../rf/linkBudget';
import { minimumSpreadingFactor, type SpreadingFactor } from '../rf/lora';
import { hexToRgb, isLowConfidence } from './colorScale';
import type { RasterGeometry } from './raster';
import { HATCH_PERIOD, HATCH_RGB, HATCH_WIDTH } from './render';

/** De verde (SF7, rápido y con poca batería) a rojo (SF12, lento y al límite). */
export const SF_COLORS: Readonly<Record<SpreadingFactor, string>> = {
  7: '#1a9850',
  8: '#66bd63',
  9: '#a6d96a',
  10: '#fee08b',
  11: '#fdae61',
  12: '#d73027',
};

const SF_RGB = new Map(Object.entries(SF_COLORS).map(([sf, hex]) => [Number(sf), hexToRgb(hex)]));

/** Pinta en `out` (RGBA, fila por fila) el SF mínimo de la subida en cada píxel. */
export function renderSpreadingFactor(
  geometry: RasterGeometry,
  grid: { lossDb: Float32Array; warnings: Int32Array },
  talkIn: LinkBudget,
  bandwidthKHz: number,
  noiseFigureDb: number,
  out: Uint8ClampedArray,
  maxSf: SpreadingFactor = 12,
  marginDb = 0,
): void {
  for (let row = 0; row < geometry.height; row++) {
    for (let col = 0; col < geometry.width; col++) {
      const p = row * geometry.width + col;
      const g = geometry.index[p]!;
      let rgb: [number, number, number] | undefined;
      if (g >= 0) {
        const sf = minimumSpreadingFactor(receivedPowerDbm(talkIn, grid.lossDb[g]!), bandwidthKHz, noiseFigureDb, maxSf, marginDb);
        if (sf !== null) rgb = SF_RGB.get(sf);
        if (isLowConfidence(grid.warnings[g]!) && (row + col) % HATCH_PERIOD < HATCH_WIDTH) rgb = HATCH_RGB;
      }
      const o = p * 4;
      if (rgb) {
        out[o] = rgb[0];
        out[o + 1] = rgb[1];
        out[o + 2] = rgb[2];
        out[o + 3] = 255;
      } else {
        out[o + 3] = 0;
      }
    }
  }
}
