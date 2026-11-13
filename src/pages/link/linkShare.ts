// Datos de /enlace para el enlace de "Compartir": los extremos A y B con su nombre, los equipos y
// antenas, el factor k, la pérdida para el balance, el terreno y el clima del multitrayecto, la
// polarización y la lluvia. Solo viaja lo que cambió frente al ejemplo con que abre la página
// (Padre Amaya → El Volador). El tipo de enlace ya va en la dirección (?tipo=radio). Módulo puro.

import { isRecord } from '../../export/projectFile';
import { changedFields, inFieldRange, positionData, readFields, readPosition, readText } from '../../export/shareLink';
import type { LonLat } from '../../geo/geodesy';
import { CLIMATE_FACTORS, TERRAIN_FACTORS } from '../../rf/pointToPoint';
import type { Polarization } from '../../rf/rain';
import { DEFAULT_RAIN_RATE_MM_H } from '../../rf/rain';
import {
  DEFAULT_CLIMATE_ID,
  DEFAULT_POLARIZATION,
  DEFAULT_TERRAIN_ID,
  EXAMPLE_A,
  EXAMPLE_B,
  EXAMPLE_NAME_A,
  EXAMPLE_NAME_B,
  K_FACTORS,
  POLARIZATIONS,
  PRESETS,
  RAIN_FIELD,
  defaultLossModel,
  linkFieldSpecs,
  type LinkParams,
  type LinkType,
  type LossModel,
} from './linkFields';

export interface LinkShare {
  /** null si el usuario borró las coordenadas de ese extremo. */
  endA: LonLat | null;
  endB: LonLat | null;
  nameA: string;
  nameB: string;
  params: LinkParams;
  /** Id del menú del factor k: "1.3333", "1" o "0.6667". */
  kFactorId: string;
  lossModel: LossModel;
  terrainId: string;
  climateId: string;
  polarization: Polarization;
  rainRate: number;
}

/** Largo máximo del nombre de un extremo (el del campo del panel). */
const NAME_MAX = 60;
const DEFAULT_K_ID = '1.3333';
const LOSS_MODELS: readonly LossModel[] = ['difraccion', 'itm'];

const isEmpty = (o: object) => Object.keys(o).length === 0;
const samePoint = (p: LonLat | null, q: LonLat) => !!p && p.lat === q.lat && p.lon === q.lon;

/**
 * Lo que va en el enlace: a y b los extremos [lat, lon] (null si se borraron), na y nb sus
 * nombres, p los equipos y antenas, k el factor k, l la pérdida para el balance, t el terreno,
 * c el clima, po la polarización y rr la lluvia.
 */
export function linkShareData(state: LinkShare, type: LinkType): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!samePoint(state.endA, EXAMPLE_A)) data.a = state.endA && positionData(state.endA);
  if (!samePoint(state.endB, EXAMPLE_B)) data.b = state.endB && positionData(state.endB);
  if (state.nameA !== EXAMPLE_NAME_A) data.na = state.nameA;
  if (state.nameB !== EXAMPLE_NAME_B) data.nb = state.nameB;
  const params = changedFields(state.params, PRESETS[type].params);
  if (!isEmpty(params)) data.p = params;
  if (state.kFactorId !== DEFAULT_K_ID) data.k = state.kFactorId;
  if (state.lossModel !== defaultLossModel(type)) data.l = state.lossModel;
  if (state.terrainId !== DEFAULT_TERRAIN_ID) data.t = state.terrainId;
  if (state.climateId !== DEFAULT_CLIMATE_ID) data.c = state.climateId;
  if (state.polarization !== DEFAULT_POLARIZATION) data.po = state.polarization;
  if (state.rainRate !== DEFAULT_RAIN_RATE_MM_H) data.rr = state.rainRate;
  return data;
}

/** Un extremo: el del ejemplo si no viene, null si se borró; undefined si no sirve. */
function readEnd(v: unknown, example: LonLat): LonLat | null | undefined {
  if (v === undefined) return example;
  if (v === null) return null;
  return readPosition(v) ?? undefined;
}

/** Equipos y antenas: la frecuencia debe ser una del menú del tipo de enlace. */
function readParams(v: unknown, type: LinkType): LinkParams | null {
  const params = readFields(v, linkFieldSpecs(type), PRESETS[type].params);
  if (!params || !isRecord(v) || v.frequencyMHz === undefined) return params;
  const frequencyOk = PRESETS[type].frequencies.some((f) => Number(f.id) === v.frequencyMHz);
  return frequencyOk ? { ...params, frequencyMHz: v.frequencyMHz as number } : null;
}

/** Revisa los datos de un enlace de /enlace; null si algo no sirve (la página abre como siempre). */
export function readLinkShare(data: unknown, type: LinkType): LinkShare | null {
  if (!isRecord(data)) return null;
  const endA = readEnd(data.a, EXAMPLE_A);
  const endB = readEnd(data.b, EXAMPLE_B);
  const nameA = data.na === undefined ? EXAMPLE_NAME_A : readText(data.na, NAME_MAX);
  const nameB = data.nb === undefined ? EXAMPLE_NAME_B : readText(data.nb, NAME_MAX);
  const params = readParams(data.p, type);
  const kFactorId = data.k ?? DEFAULT_K_ID;
  const lossModel = data.l ?? defaultLossModel(type);
  const terrainId = data.t ?? DEFAULT_TERRAIN_ID;
  const climateId = data.c ?? DEFAULT_CLIMATE_ID;
  const polarization = data.po ?? DEFAULT_POLARIZATION;
  const rainRate = data.rr ?? DEFAULT_RAIN_RATE_MM_H;
  if (endA === undefined || endB === undefined || nameA === null || nameB === null || !params) return null;
  if (
    !K_FACTORS.some((k) => k.id === kFactorId) ||
    !LOSS_MODELS.includes(lossModel as LossModel) ||
    !TERRAIN_FACTORS.some((t) => t.id === terrainId) ||
    !CLIMATE_FACTORS.some((c) => c.id === climateId) ||
    !POLARIZATIONS.some((p) => p.id === polarization) ||
    !inFieldRange(rainRate, RAIN_FIELD)
  ) {
    return null;
  }
  return {
    endA,
    endB,
    nameA,
    nameB,
    params,
    kFactorId: kFactorId as string,
    lossModel: lossModel as LossModel,
    terrainId: terrainId as string,
    climateId: climateId as string,
    polarization: polarization as Polarization,
    rainRate,
  };
}
