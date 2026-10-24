// Propagación en interiores: modelo multipared (COST-231 Multi-Wall) con pérdidas por material.
// L = pérdida en espacio libre + suma de las pérdidas de cada muro que cruza la línea directa.
// Módulo puro.

import { freeSpaceLossDb } from './fieldStrength';

export type WifiBand = '2.4' | '5' | '6';

export const WIFI_BANDS: readonly { id: WifiBand; label: string; frequencyMHz: number }[] = [
  { id: '2.4', label: '2,4 GHz', frequencyMHz: 2437 },
  { id: '5', label: '5 GHz', frequencyMHz: 5500 },
  { id: '6', label: '6 GHz', frequencyMHz: 6175 },
];

export type MaterialId =
  | 'drywall'
  | 'madera'
  | 'vidrio'
  | 'vidrio-reflectivo'
  | 'ladrillo'
  | 'bloque'
  | 'concreto'
  | 'metal';

export interface Material {
  id: MaterialId;
  label: string;
  /** Color con que se dibuja en el plano. */
  color: string;
  /** Grosor con que se dibuja (px). */
  drawWidth: number;
  /** Pérdida al atravesarlo (dB) en cada banda. */
  lossDb: Record<WifiBand, number>;
}

/**
 * Pérdidas típicas por material (dB), recopiladas de la ITU-R P.2040 y de guías de diseño WiFi.
 * Varían con el grosor y la humedad: son un punto de partida para ajustar con mediciones.
 */
export const MATERIALS: readonly Material[] = [
  { id: 'drywall', label: 'Drywall o tabique de yeso', color: '#9aa4b1', drawWidth: 4, lossDb: { '2.4': 3, '5': 4, '6': 4.5 } },
  { id: 'madera', label: 'Puerta o muro de madera', color: '#a8723c', drawWidth: 5, lossDb: { '2.4': 3, '5': 4, '6': 5 } },
  { id: 'vidrio', label: 'Ventana de vidrio', color: '#54aeff', drawWidth: 3, lossDb: { '2.4': 2, '5': 3, '6': 4 } },
  { id: 'vidrio-reflectivo', label: 'Vidrio reflectivo (low-e)', color: '#0550ae', drawWidth: 3, lossDb: { '2.4': 25, '5': 30, '6': 32 } },
  { id: 'ladrillo', label: 'Muro de ladrillo', color: '#c4553a', drawWidth: 7, lossDb: { '2.4': 8, '5': 12, '6': 14 } },
  { id: 'bloque', label: 'Bloque de concreto', color: '#7d7d7d', drawWidth: 7, lossDb: { '2.4': 10, '5': 15, '6': 17 } },
  { id: 'concreto', label: 'Concreto o muro de carga', color: '#4a4a4a', drawWidth: 9, lossDb: { '2.4': 15, '5': 22, '6': 25 } },
  { id: 'metal', label: 'Metal (puerta, ascensor, gabinete)', color: '#1f2328', drawWidth: 6, lossDb: { '2.4': 30, '5': 35, '6': 38 } },
];

export function materialById(id: MaterialId): Material {
  return MATERIALS.find((m) => m.id === id)!;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Si los segmentos AB y CD se cruzan (sin contar el solo roce en un extremo). */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, s: Segment): boolean {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = s.x2 - s.x1;
  const d2y = s.y2 - s.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false; // paralelos
  const t = ((s.x1 - ax) * d2y - (s.y1 - ay) * d2x) / denom;
  const u = ((s.x1 - ax) * d1y - (s.y1 - ay) * d1x) / denom;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1;
}

/** Distancia mínima del modelo (m): más cerca del AP se toma la pérdida a 1 m. */
const MIN_DISTANCE_M = 1;

/**
 * Pérdida multipared (dB) entre el AP y un punto, con distancias en metros:
 * espacio libre a la distancia directa + pérdida de cada muro cruzado.
 */
export function multiWallLossDb(
  ax: number,
  ay: number,
  px: number,
  py: number,
  walls: readonly (Segment & { material: MaterialId })[],
  band: WifiBand,
  frequencyMHz: number,
): { lossDb: number; wallsCrossed: number } {
  const d = Math.max(MIN_DISTANCE_M, Math.hypot(px - ax, py - ay));
  let loss = freeSpaceLossDb(d / 1000, frequencyMHz);
  let crossed = 0;
  for (const wall of walls) {
    if (segmentsCross(ax, ay, px, py, wall)) {
      loss += materialById(wall.material).lossDb[band];
      crossed++;
    }
  }
  return { lossDb: loss, wallsCrossed: crossed };
}

/** Umbrales de señal WiFi (dBm) y su significado práctico. */
export const WIFI_THRESHOLDS: readonly { dbm: number; label: string }[] = [
  { dbm: -50, label: 'excelente' },
  { dbm: -60, label: 'muy buena' },
  { dbm: -67, label: 'buena para voz y video' },
  { dbm: -75, label: 'aceptable para navegar' },
  { dbm: -85, label: 'débil, se corta' },
];
