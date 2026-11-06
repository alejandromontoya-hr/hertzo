// Plano de interiores: muros con material, access points y mapa de calor de señal. Módulo puro.

import {
  WIFI_BANDS,
  effectiveEirpDbm,
  eirpLimitDbm,
  furnitureById,
  multiWallLossDb,
  type ChannelWidth,
  type FurnitureId,
  type MaterialId,
  type Segment,
  type WifiBand,
} from '../rf/indoor';

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
  /** Mobiliario y personas que no se dibujan pero atenúan. */
  furniture: FurnitureId;
}

/** Datos del enlace que no son del plano: el cliente y el canal. */
export interface LinkRadio {
  /** Potencia del cliente (dBm), con antena de 0 dBi. */
  clientPowerDbm: number;
  channelWidthMHz: ChannelWidth;
}

/** Sentido del enlace: bajada (AP → cliente), subida (cliente → AP) o el peor de los dos en cada punto. */
export type LinkDirection = 'down' | 'up' | 'worst';

export const LINK_DIRECTIONS: readonly { id: LinkDirection; label: string }[] = [
  { id: 'worst', label: 'Peor de las dos' },
  { id: 'down', label: 'Bajada (AP → cliente)' },
  { id: 'up', label: 'Subida (cliente → AP)' },
];

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

/** PIRE con que se calcula cada sentido (dBm), ya recortada al límite de 6 GHz si lo pasa. */
export function linkEirps(ap: AccessPoint, band: WifiBand, radio: LinkRadio): { apDbm: number; clientDbm: number } {
  return {
    apDbm: effectiveEirpDbm(ap.powerDbm + ap.gainDbi, eirpLimitDbm(band, radio.channelWidthMHz, 'ap')),
    clientDbm: effectiveEirpDbm(radio.clientPowerDbm, eirpLimitDbm(band, radio.channelWidthMHz, 'client')),
  };
}

/**
 * Señal en los dos sentidos para una pérdida de trayecto (dB), que es la misma de ida y de vuelta:
 * bajada = PIRE del AP − pérdida (el cliente recibe con 0 dBi);
 * subida = PIRE del cliente + ganancia del AP − pérdida (el AP recibe con su antena).
 */
export function linkSignals(ap: AccessPoint, band: WifiBand, radio: LinkRadio, lossDb: number): Record<LinkDirection, number> {
  const eirp = linkEirps(ap, band, radio);
  const down = eirp.apDbm - lossDb;
  const up = eirp.clientDbm + ap.gainDbi - lossDb;
  return { down, up, worst: Math.min(down, up) };
}

/** Señal de cada AP en un punto, en los dos sentidos, con los muros que cruza. */
export function signalsAt(
  plan: FloorPlan,
  band: WifiBand,
  radio: LinkRadio,
  x: number,
  y: number,
): { ap: AccessPoint; signals: Record<LinkDirection, number>; walls: number }[] {
  const frequencyMHz = WIFI_BANDS.find((b) => b.id === band)!.frequencyMHz;
  const exponent = furnitureById(plan.furniture).exponent;
  return plan.aps.map((ap) => {
    const r = multiWallLossDb(ap.x, ap.y, x, y, plan.walls, band, frequencyMHz, exponent);
    return { ap, signals: linkSignals(ap, band, radio, r.lossDb), walls: r.wallsCrossed };
  });
}

/**
 * Mapas de calor de bajada, subida y el peor de los dos. En cada uno, el mejor AP es el que da más
 * señal en ese sentido; en "peor", el que deja el mejor de los peores (el que sirve en ambos sentidos).
 */
export function computeHeatmaps(plan: FloorPlan, band: WifiBand, radio: LinkRadio): Record<LinkDirection, Heatmap> {
  const cellM = heatmapCellM(plan);
  const cols = Math.max(1, Math.round(plan.widthM / cellM));
  const rows = Math.max(1, Math.round(plan.heightM / cellM));
  const frequencyMHz = WIFI_BANDS.find((b) => b.id === band)!.frequencyMHz;
  const exponent = furnitureById(plan.furniture).exponent;
  const empty = (): Heatmap => ({
    cols,
    rows,
    cellM,
    rssiDbm: new Float32Array(cols * rows).fill(Number.NaN),
    bestAp: new Int16Array(cols * rows).fill(-1),
  });
  const maps: Record<LinkDirection, Heatmap> = { down: empty(), up: empty(), worst: empty() };
  const directions = ['down', 'up', 'worst'] as const;
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * cellM;
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cellM;
      const i = row * cols + col;
      plan.aps.forEach((ap, a) => {
        const { lossDb } = multiWallLossDb(ap.x, ap.y, x, y, plan.walls, band, frequencyMHz, exponent);
        const signals = linkSignals(ap, band, radio, lossDb);
        for (const direction of directions) {
          const map = maps[direction];
          if (!(signals[direction] <= map.rssiDbm[i]!)) {
            map.rssiDbm[i] = signals[direction];
            map.bestAp[i] = a;
          }
        }
      });
    }
  }
  return maps;
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
