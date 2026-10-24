// Pintado genérico de imágenes de cobertura. Módulo puro.
// Cada página calcula un valor por píxel (dBm, dBµV/m, SINR…) o una categoría (mejor sector,
// clase de desbalance) y aquí se convierte en colores, con el rayado de baja confianza encima.

import { hexToRgb } from './colorScale';

/** Rayado de baja confianza: 2 de cada 6 diagonales de píxeles, en gris oscuro. */
const HATCH_PERIOD = 6;
const HATCH_WIDTH = 2;
const HATCH_RGB: readonly [number, number, number] = [55, 55, 55];

export interface PaintSize {
  width: number;
  height: number;
}

function put(out: Uint8ClampedArray, p: number, rgb: readonly number[] | undefined) {
  const o = p * 4;
  if (rgb) {
    out[o] = rgb[0]!;
    out[o + 1] = rgb[1]!;
    out[o + 2] = rgb[2]!;
    out[o + 3] = 255;
  } else {
    out[o + 3] = 0;
  }
}

const isHatched = (row: number, col: number) => (row + col) % HATCH_PERIOD < HATCH_WIDTH;

/**
 * Franjas por umbral: el color i se usa si el valor es ≥ thresholds[i] (umbrales de mayor a
 * menor, se ordenan solos). Por debajo del último umbral o con NaN no se pinta.
 */
export function paintBands(
  size: PaintSize,
  values: Float32Array,
  thresholds: readonly number[],
  colors: readonly string[],
  lowConfidence: Uint8Array | null,
  out: Uint8ClampedArray,
): void {
  const sorted = [...thresholds].sort((a, b) => b - a);
  const rgb = colors.map(hexToRgb);
  for (let row = 0; row < size.height; row++) {
    for (let col = 0; col < size.width; col++) {
      const p = row * size.width + col;
      const v = values[p]!;
      let color: readonly number[] | undefined;
      if (v >= sorted[sorted.length - 1]!) {
        for (let i = 0; i < sorted.length; i++) {
          if (v >= sorted[i]!) {
            color = rgb[i];
            break;
          }
        }
      }
      if (lowConfidence?.[p] && isHatched(row, col)) color = HATCH_RGB;
      put(out, p, color);
    }
  }
}

/** Categorías: el valor k (≥ 0) usa colors[k]; −1 no se pinta. */
export function paintCategories(
  size: PaintSize,
  categories: Int16Array,
  colors: readonly string[],
  lowConfidence: Uint8Array | null,
  out: Uint8ClampedArray,
): void {
  const rgb = colors.map(hexToRgb);
  for (let row = 0; row < size.height; row++) {
    for (let col = 0; col < size.width; col++) {
      const p = row * size.width + col;
      const k = categories[p]!;
      let color: readonly number[] | undefined = k >= 0 ? rgb[k] : undefined;
      if (lowConfidence?.[p] && isHatched(row, col)) color = HATCH_RGB;
      put(out, p, color);
    }
  }
}

/** Etiquetas de franjas para la leyenda: "≥ 74 dBµV/m", "66 a 74 dBµV/m"… */
export function bandLabels(thresholds: readonly number[], unit: string): string[] {
  const sorted = [...thresholds].sort((a, b) => b - a);
  return sorted.map((low, i) => (i === 0 ? `≥ ${low} ${unit}` : `${low} a ${sorted[i - 1]} ${unit}`));
}
