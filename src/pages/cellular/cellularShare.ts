// Datos de /celular para el enlace de "Compartir": la torre, el modelo, los parámetros del sitio y
// del teléfono, la antena, los sectores, la portadora, dónde está el teléfono, la distancia a los
// vecinos y los umbrales de RSRP, SINR y subida. Solo viaja lo que cambió frente a los valores de
// la banda. La banda, la confiabilidad y el entorno ya van en la dirección (?banda=850). Módulo puro.

import { isFiniteNumber, isRecord, readList } from '../../export/projectFile';
import { changedFields, readFields } from '../../export/shareLink';
import { CARRIERS, PHONE_LOCATIONS, type PhoneLocation, type SectorAntenna } from '../../rf/cellular';
import { mapShareData, readMapShare, readThresholds, thresholdData, type MapShareCommon, type MapShareOptions } from '../shared/mapShare';
import {
  ANTENNA_FIELDS,
  BASE_ANTENNA,
  BASE_SITE,
  CELL_THRESHOLDS,
  DEFAULT_AZIMUTHS,
  DEFAULT_NEIGHBOR_KM,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MAX_SECTORS,
  MODELS,
  NEIGHBOR_FIELD,
  SITE_FIELDS,
  defaultModel,
  type Band,
  type ModelId,
  type SiteParams,
} from './cellularFields';

/**
 * La torre, su nombre, su radio de cálculo, los umbrales de RSRP (`thresholds`) y los teléfonos,
 * cada uno con dónde está (en la calle o dentro de un edificio) o null si usa el del panel.
 */
export interface CellularShare extends MapShareCommon {
  model: ModelId;
  siteParams: SiteParams;
  antenna: SectorAntenna;
  phone: PhoneLocation;
  neighborKm: number;
  /** Azimut de cada sector (°), de 1 a 4 sectores. */
  azimuths: number[];
  carrierId: string;
  sinrThresholds: number[];
  upThresholds: number[];
}

const MAP_OPTIONS: MapShareOptions = {
  defaultRadiusKm: DEFAULT_RADIUS_KM,
  maxRadiusKm: MAX_RADIUS_KM,
  thresholds: CELL_THRESHOLDS.rsrp,
  profileIds: PHONE_LOCATIONS.map((p) => p.id),
};

const DEFAULT_PHONE: PhoneLocation = 'exterior';

/** Los valores típicos de la banda: con ellos abre la página al elegirla. */
const bandSite = (band: Band): SiteParams => ({ ...BASE_SITE, ...band.site });
const bandAntenna = (band: Band): SectorAntenna => ({ ...BASE_ANTENNA, ...band.antenna });

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const isEmpty = (o: object) => Object.keys(o).length === 0;

/**
 * Lo que va en el enlace: lo común (s, n, r, u los umbrales de RSRP y e los teléfonos), m el modelo, sp el sitio y
 * el teléfono, a la antena, ph dónde está el teléfono, k la distancia a los vecinos, z los
 * azimuts, cr la portadora, us los umbrales de SINR y uu los de subida.
 */
export function cellularShareData(state: CellularShare, band: Band): Record<string, unknown> {
  const data = mapShareData(state, MAP_OPTIONS);
  if (state.model !== defaultModel(band)) data.m = state.model;
  const site = changedFields(state.siteParams, bandSite(band));
  if (!isEmpty(site)) data.sp = site;
  const antenna = changedFields(state.antenna, bandAntenna(band));
  if (!isEmpty(antenna)) data.a = antenna;
  if (state.phone !== DEFAULT_PHONE) data.ph = state.phone;
  if (state.neighborKm !== DEFAULT_NEIGHBOR_KM) data.k = state.neighborKm;
  if (!sameList(state.azimuths, DEFAULT_AZIMUTHS)) data.z = state.azimuths;
  if (state.carrierId !== band.carrier) data.cr = state.carrierId;
  const sinr = thresholdData(state.sinrThresholds, CELL_THRESHOLDS.sinr);
  if (sinr) data.us = sinr;
  const up = thresholdData(state.upThresholds, CELL_THRESHOLDS.up);
  if (up) data.uu = up;
  return data;
}

function readAzimuths(v: unknown): number[] | null {
  if (v === undefined) return [...DEFAULT_AZIMUTHS];
  const list = readList(v, (a) => (isFiniteNumber(a) && a >= 0 && a <= 360 ? a : null));
  return list && list.length >= 1 && list.length <= MAX_SECTORS ? list : null;
}

/** Revisa los datos de un enlace de /celular; null si algo no sirve (la página abre como siempre). */
export function readCellularShare(data: unknown, band: Band): CellularShare | null {
  if (!isRecord(data)) return null;
  const common = readMapShare(data, MAP_OPTIONS);
  const model = data.m ?? defaultModel(band);
  const siteParams = readFields(data.sp, SITE_FIELDS, bandSite(band));
  const antenna = readFields(data.a, ANTENNA_FIELDS, bandAntenna(band));
  const phone = data.ph ?? DEFAULT_PHONE;
  const neighbors = readFields({ neighborKm: data.k ?? DEFAULT_NEIGHBOR_KM }, [NEIGHBOR_FIELD], { neighborKm: DEFAULT_NEIGHBOR_KM });
  const azimuths = readAzimuths(data.z);
  const carrierId = data.cr ?? band.carrier;
  const sinrThresholds = readThresholds(data.us, CELL_THRESHOLDS.sinr);
  const upThresholds = readThresholds(data.uu, CELL_THRESHOLDS.up);
  if (!common || !siteParams || !antenna || !neighbors || !azimuths || !sinrThresholds || !upThresholds) return null;
  if (!MODELS.some((m) => m.id === model) || !PHONE_LOCATIONS.some((p) => p.id === phone) || !CARRIERS.some((c) => c.id === carrierId)) return null;
  return {
    ...common,
    model: model as ModelId,
    siteParams,
    antenna,
    phone: phone as PhoneLocation,
    neighborKm: neighbors.neighborKm,
    azimuths,
    carrierId: carrierId as string,
    sinrThresholds,
    upThresholds,
  };
}
