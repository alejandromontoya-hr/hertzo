// Proyecto de Cavernas para guardar en un archivo: la red de galerías, antenas y cables, y todos
// los ajustes de radio, roca y cable. Módulo puro.

import { isFiniteNumber, isRecord, readList, readNumbers } from '../export/projectFile';
import type { LeakyCable, Polarization } from '../rf/tunnel';
import type { Cable, CaveModel, CaveTransmitter, Gallery, Point } from './network';
import { CAVE_BANDS, ROCKS } from './presets';

export interface CaveProject {
  model: CaveModel;
  bandId: string;
  rockId: string;
  /** Rugosidad de las paredes (m); puede diferir de la de la roca elegida. */
  roughnessM: number;
  polarization: Polarization;
  /** Pérdida en una curva de 90° (dB). */
  corner90Db: number;
  /** Sensibilidad del radio (dBm). */
  sensitivityDbm: number;
  cable: LeakyCable;
  /** Umbrales de la leyenda (dBm), de mayor a menor. */
  thresholds: number[];
}

/** Umbrales de la leyenda de Cavernas: sensibilidad + 30, + 20, + 10 y + 0 dB. */
export const CAVE_THRESHOLD_COUNT = 4;

function readPoint(v: unknown): Point | null {
  return isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) ? { x: v.x, y: v.y } : null;
}

/** Línea de al menos dos puntos (galería o cable). */
function readPath(v: unknown): Point[] | null {
  const points = readList(v, readPoint);
  return points && points.length >= 2 ? points : null;
}

function readGallery(v: unknown): Gallery | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const points = readPath(v.points);
  const { widthM, heightM } = v;
  if (!points || !isFiniteNumber(widthM) || !isFiniteNumber(heightM) || widthM <= 0 || heightM <= 0) return null;
  return { id: v.id, name: v.name, points, widthM, heightM };
}

function readTransmitter(v: unknown): CaveTransmitter | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const { x, y, powerDbm, gainDbi } = v;
  if (![x, y, powerDbm, gainDbi].every(isFiniteNumber)) return null;
  return { id: v.id, name: v.name, x: x as number, y: y as number, powerDbm: powerDbm as number, gainDbi: gainDbi as number };
}

function readCable(v: unknown): Cable | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !isFiniteNumber(v.headPowerDbm)) return null;
  const points = readPath(v.points);
  return points ? { id: v.id, points, headPowerDbm: v.headPowerDbm } : null;
}

/** Revisa los datos de un archivo y devuelve una copia limpia, o null si falta o sobra algo inválido. */
export function readCaveProject(data: unknown): CaveProject | null {
  if (!isRecord(data) || !isRecord(data.model) || !isRecord(data.cable)) return null;
  const galleries = readList(data.model.galleries, readGallery);
  const transmitters = readList(data.model.transmitters, readTransmitter);
  const cables = readList(data.model.cables, readCable);
  const band = CAVE_BANDS.find((b) => b.id === data.bandId);
  const rock = ROCKS.find((r) => r.id === data.rockId);
  const { roughnessM, polarization, corner90Db, sensitivityDbm } = data;
  const { longitudinalDbPer100m, couplingLossDb } = data.cable;
  const thresholds = readNumbers(data.thresholds, CAVE_THRESHOLD_COUNT);
  if (!galleries || !transmitters || !cables || !band || !rock || !thresholds) return null;
  if (polarization !== 'vertical' && polarization !== 'horizontal') return null;
  if (![roughnessM, corner90Db, sensitivityDbm, longitudinalDbPer100m, couplingLossDb].every(isFiniteNumber)) return null;
  return {
    model: { galleries, transmitters, cables },
    bandId: band.id,
    rockId: rock.id,
    roughnessM: roughnessM as number,
    polarization,
    corner90Db: corner90Db as number,
    sensitivityDbm: sensitivityDbm as number,
    cable: { longitudinalDbPer100m: longitudinalDbPer100m as number, couplingLossDb: couplingLossDb as number },
    thresholds,
  };
}
