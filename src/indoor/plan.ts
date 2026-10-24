// Plano de interiores: muros con material, access points y mapa de calor de señal. Módulo puro.

import { WIFI_BANDS, multiWallLossDb, type MaterialId, type Segment, type WifiBand } from '../rf/indoor';

export interface Wall extends Segment {
  id: string;
  material: MaterialId;
}

export interface AccessPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Potencia de transmisión (dBm). */
  powerDbm: number;
  /** Ganancia de la antena (dBi). */
  gainDbi: number;
}

export interface FloorPlan {
  widthM: number;
  heightM: number;
  walls: Wall[];
  aps: AccessPoint[];
}

export interface Heatmap {
  cols: number;
  rows: number;
  /** Lado de cada celda (m). */
  cellM: number;
  /** Mejor señal en cada celda (dBm), fila por fila. */
  rssiDbm: Float32Array;
  /** Índice del AP que da la mejor señal (−1 sin APs). */
  bestAp: Int16Array;
}

/** Tamaño de celda: 10 cm, o más grande en planos enormes para no pasar de ~300 celdas por lado. */
export function heatmapCellM(plan: FloorPlan): number {
  return Math.max(0.1, Math.max(plan.widthM, plan.heightM) / 300);
}

export function computeHeatmap(plan: FloorPlan, band: WifiBand): Heatmap {
  const cellM = heatmapCellM(plan);
  const cols = Math.max(1, Math.round(plan.widthM / cellM));
  const rows = Math.max(1, Math.round(plan.heightM / cellM));
  const frequencyMHz = WIFI_BANDS.find((b) => b.id === band)!.frequencyMHz;
  const rssiDbm = new Float32Array(cols * rows).fill(Number.NaN);
  const bestAp = new Int16Array(cols * rows).fill(-1);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * cellM;
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cellM;
      const i = row * cols + col;
      plan.aps.forEach((ap, a) => {
        const { lossDb } = multiWallLossDb(ap.x, ap.y, x, y, plan.walls, band, frequencyMHz);
        const rssi = ap.powerDbm + ap.gainDbi - lossDb;
        if (!(rssi <= rssiDbm[i]!)) {
          rssiDbm[i] = rssi;
          bestAp[i] = a;
        }
      });
    }
  }
  return { cols, rows, cellM, rssiDbm, bestAp };
}

/** Fracción del plano (0 a 1) con señal ≥ `thresholdDbm`. */
export function coverageFraction(heatmap: Heatmap, thresholdDbm: number): number {
  let count = 0;
  for (const v of heatmap.rssiDbm) if (v >= thresholdDbm) count++;
  return count / heatmap.rssiDbm.length;
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Distancia (m) de un punto a un segmento. */
export function distanceToSegment(px: number, py: number, s: Segment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

let idCounter = 0;
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${(++idCounter).toString(36)}`;
}
