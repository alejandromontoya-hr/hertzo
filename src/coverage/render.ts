// Colores de cada píxel de la imagen de cobertura. Módulo puro: se vuelve a pintar al
// instante cuando cambian la potencia, las pérdidas, los umbrales o el mapa elegido,
// sin volver a correr el motor de propagación.

import type { LinkBudget } from '../rf/linkBudget';
import { BALANCE_LEGEND, LEVEL_COLORS, balanceClass, hexToRgb, isLowConfidence } from './colorScale';
import type { RasterGeometry } from './raster';

export type CoverageView = 'talkOut' | 'talkIn' | 'balance';

export interface CoverageGrids {
  talkOut: { lossDb: Float32Array; warnings: Int32Array };
  talkIn: { lossDb: Float32Array; warnings: Int32Array };
}

/** Rayado de baja confianza: 2 de cada 6 diagonales de píxeles, en gris oscuro. */
const HATCH_PERIOD = 6;
const HATCH_WIDTH = 2;
const HATCH_RGB: [number, number, number] = [55, 55, 55];

const LEVEL_RGB = LEVEL_COLORS.map(hexToRgb);
const BALANCE_RGB = new Map(BALANCE_LEGEND.map((entry) => [entry.cls, hexToRgb(entry.color)]));

/** Lo que se suma a la PIRE en el lado receptor: nivel = constante − pérdida de trayecto. */
const levelOffset = (b: LinkBudget) => b.eirpDbm + b.rxAntennaGainDbi + b.rxGainsDb - b.rxLossesDb;

/** Pinta en `out` (RGBA, fila por fila) el mapa elegido. */
export function renderCoverage(
  geometry: RasterGeometry,
  grids: CoverageGrids,
  view: CoverageView,
  talkOut: LinkBudget,
  talkIn: LinkBudget,
  thresholdsDbm: readonly number[],
  out: Uint8ClampedArray,
): void {
  const thresholds = [...thresholdsDbm].sort((a, b) => b - a);
  const outOffset = levelOffset(talkOut);
  const inOffset = levelOffset(talkIn);

  for (let row = 0; row < geometry.height; row++) {
    for (let col = 0; col < geometry.width; col++) {
      const p = row * geometry.width + col;
      const g = geometry.index[p]!;
      let rgb: [number, number, number] | undefined;
      let lowConfidence = false;

      if (g >= 0) {
        if (view === 'balance') {
          const outMargin = outOffset - grids.talkOut.lossDb[g]! - talkOut.sensitivityDbm;
          const inMargin = inOffset - grids.talkIn.lossDb[g]! - talkIn.sensitivityDbm;
          rgb = BALANCE_RGB.get(balanceClass(outMargin, inMargin));
          lowConfidence = isLowConfidence(grids.talkOut.warnings[g]! | grids.talkIn.warnings[g]!);
        } else {
          const budget = view === 'talkOut' ? talkOut : talkIn;
          const grid = view === 'talkOut' ? grids.talkOut : grids.talkIn;
          const level = (view === 'talkOut' ? outOffset : inOffset) - grid.lossDb[g]!;
          if (level >= budget.sensitivityDbm) {
            let band = thresholds.length;
            for (let i = 0; i < thresholds.length; i++) {
              if (level >= thresholds[i]!) {
                band = i;
                break;
              }
            }
            rgb = LEVEL_RGB[band];
          }
          lowConfidence = isLowConfidence(grid.warnings[g]!);
        }
      }

      if (lowConfidence && (row + col) % HATCH_PERIOD < HATCH_WIDTH) rgb = HATCH_RGB;
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
