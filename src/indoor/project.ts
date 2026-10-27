// Proyecto de Interiores para guardar en un archivo: el plano, la banda y los umbrales. Módulo puro.

import { isFiniteNumber, isRecord, readList, readNumbers } from '../export/projectFile';
import { MATERIALS, WIFI_BANDS, WIFI_THRESHOLDS, type MaterialId, type WifiBand } from '../rf/indoor';
import type { AccessPoint, FloorPlan, Wall } from './plan';

export interface IndoorProject {
  plan: FloorPlan;
  band: WifiBand;
  /** Umbrales de la leyenda de señal (dBm), uno por franja. */
  thresholds: number[];
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
  if (!walls || !aps || !band || !thresholds) return null;
  return { plan: { widthM, heightM, walls, aps }, band, thresholds };
}
