// Proyecto de Interiores para guardar en un archivo: el plano, la banda, los umbrales, la potencia
// del cliente y el ancho de canal de cada banda. Módulo puro.

import { isFiniteNumber, isRecord, readList, readNumbers } from '../export/projectFile';
import {
  CHANNEL_WIDTHS,
  DEFAULT_CHANNEL_WIDTH,
  DEFAULT_CLIENT_POWER_DBM,
  FURNITURE,
  MATERIALS,
  WIFI_BANDS,
  WIFI_THRESHOLDS,
  type ChannelWidth,
  type FurnitureId,
  type MaterialId,
  type WifiBand,
} from '../rf/indoor';
import type { AccessPoint, FloorPlan, Wall } from './plan';

export interface IndoorProject {
  plan: FloorPlan;
  band: WifiBand;
  /** Umbrales de la leyenda de señal (dBm), uno por franja. */
  thresholds: number[];
  /** Potencia del cliente (dBm) en cada banda. */
  clientPowerDbm: Record<WifiBand, number>;
  /** Ancho de canal (MHz) en cada banda. */
  channelWidthMHz: Record<WifiBand, ChannelWidth>;
}

/**
 * Los archivos guardados antes de que existieran estos datos no los traen: el mobiliario queda en
 * "Casa amueblada" y la potencia del cliente y el ancho de canal en los valores por omisión.
 */
const DEFAULT_FURNITURE: FurnitureId = 'casa';

function readFurniture(v: unknown): FurnitureId | null {
  if (v === undefined) return DEFAULT_FURNITURE;
  return FURNITURE.find((f) => f.id === v)?.id ?? null;
}

function readClientPower(v: unknown): Record<WifiBand, number> | null {
  if (v === undefined) return { ...DEFAULT_CLIENT_POWER_DBM };
  if (!isRecord(v)) return null;
  const out = { ...DEFAULT_CLIENT_POWER_DBM };
  for (const { id } of WIFI_BANDS) {
    const value = v[id];
    if (!isFiniteNumber(value)) return null;
    out[id] = value;
  }
  return out;
}

function readChannelWidths(v: unknown): Record<WifiBand, ChannelWidth> | null {
  if (v === undefined) return { ...DEFAULT_CHANNEL_WIDTH };
  if (!isRecord(v)) return null;
  const out = { ...DEFAULT_CHANNEL_WIDTH };
  for (const { id } of WIFI_BANDS) {
    const width = CHANNEL_WIDTHS[id].find((w) => w === v[id]);
    if (width === undefined) return null;
    out[id] = width;
  }
  return out;
}

function readWall(v: unknown): Wall | null {
  if (!isRecord(v) || typeof v.id !== 'string') return null;
  const { x1, y1, x2, y2, material } = v;
  if (![x1, y1, x2, y2].every(isFiniteNumber)) return null;
  if (!MATERIALS.some((m) => m.id === material)) return null;
  return { id: v.id, x1: x1 as number, y1: y1 as number, x2: x2 as number, y2: y2 as number, material: material as MaterialId };
}

function readAp(v: unknown): AccessPoint | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const { x, y, powerDbm, gainDbi } = v;
  if (![x, y, powerDbm, gainDbi].every(isFiniteNumber)) return null;
  return { id: v.id, name: v.name, x: x as number, y: y as number, powerDbm: powerDbm as number, gainDbi: gainDbi as number };
}

/** Revisa los datos de un archivo y devuelve una copia limpia, o null si falta o sobra algo inválido. */
export function readIndoorProject(data: unknown): IndoorProject | null {
  if (!isRecord(data) || !isRecord(data.plan)) return null;
  const { widthM, heightM } = data.plan;
  if (!isFiniteNumber(widthM) || !isFiniteNumber(heightM) || widthM <= 0 || heightM <= 0) return null;
  const walls = readList(data.plan.walls, readWall);
  const aps = readList(data.plan.aps, readAp);
  const band = WIFI_BANDS.find((b) => b.id === data.band)?.id;
  const thresholds = readNumbers(data.thresholds, WIFI_THRESHOLDS.length);
  const furniture = readFurniture(data.plan.furniture);
  const clientPowerDbm = readClientPower(data.clientPowerDbm);
  const channelWidthMHz = readChannelWidths(data.channelWidthMHz);
  if (!walls || !aps || !band || !thresholds || !furniture || !clientPowerDbm || !channelWidthMHz) return null;
  return { plan: { widthM, heightM, walls, aps, furniture }, band, thresholds, clientPowerDbm, channelWidthMHz };
}
