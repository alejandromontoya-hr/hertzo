// Lo que comparten los enlaces de "Compartir" de las páginas con mapa: el sitio, su nombre, el
// radio de cálculo, los umbrales de la leyenda, los equipos y el perfil elegido (radio o sensor,
// con sus valores si es "Personalizado"). Solo viaja lo que cambió. Módulo puro.

import { DEFAULT_LEVEL_THRESHOLDS_DBM } from '../../coverage/colorScale';
import { isFiniteNumber, readList } from '../../export/projectFile';
import { changedFields, positionData, readFields, readPosition, readText } from '../../export/shareLink';
import type { LonLat } from '../../geo/geodesy';
import type { NumberFieldSpec } from '../../ui/fields';

export interface SharedDevice {
  name: string;
  position: LonLat;
  /** Perfil propio del equipo; null si usa el elegido en el panel. */
  profileId: string | null;
}

export interface MapShareCommon {
  site: LonLat | null;
  name: string;
  radiusKm: number;
  /** Umbrales de la leyenda (dBm), de mayor a menor. */
  thresholds: number[];
  devices: SharedDevice[];
}

/** Umbrales de una vista de la leyenda: los de siempre y el rango que acepta. */
export interface ThresholdSpec {
  defaults: readonly number[];
  min: number;
  max: number;
}

/** Umbrales de nivel recibido de Terreno y LoRa (dBm). */
export const LEVEL_THRESHOLDS: ThresholdSpec = { defaults: DEFAULT_LEVEL_THRESHOLDS_DBM, min: -150, max: -20 };

export interface MapShareOptions {
  defaultRadiusKm: number;
  maxRadiusKm: number;
  /** Umbrales de la vista principal de la leyenda. */
  thresholds: ThresholdSpec;
  /** Perfiles que puede tener un equipo en su fila (vacío si la página no tiene equipos). */
  profileIds: readonly string[];
}

/** Largo máximo del nombre del sitio (el del campo del panel) y del de cada equipo. */
const SITE_NAME_MAX = 60;
const DEVICE_NAME_MAX = 100;
/** El radio de cálculo más corto que admite el campo (km). */
const MIN_RADIUS_KM = 1;
const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Los umbrales para el enlace, o undefined si son los de siempre. */
export const thresholdData = (list: readonly number[], spec: ThresholdSpec): number[] | undefined =>
  sameList(list, spec.defaults) ? undefined : [...list];

/** Umbrales del enlace (los de siempre si no trae); null si no son tantos como siempre o se salen del rango. */
export function readThresholds(v: unknown, spec: ThresholdSpec): number[] | null {
  if (v === undefined) return [...spec.defaults];
  const list = readList(v, (n) => (isFiniteNumber(n) && n >= spec.min && n <= spec.max ? n : null));
  return list && list.length === spec.defaults.length ? list : null;
}

/**
 * Claves cortas: s sitio [lat, lon], n nombre, r radio de cálculo, u umbrales y e los equipos
 * como [nombre, lat, lon] o [nombre, lat, lon, perfil].
 */
export function mapShareData(common: MapShareCommon, options: MapShareOptions): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (common.site) data.s = positionData(common.site);
  if (common.name) data.n = common.name;
  if (common.radiusKm !== options.defaultRadiusKm) data.r = common.radiusKm;
  const thresholds = thresholdData(common.thresholds, options.thresholds);
  if (thresholds) data.u = thresholds;
  if (common.devices.length > 0) {
    data.e = common.devices.map((d) => {
      const [lat, lon] = positionData(d.position);
      return d.profileId ? [d.name, lat, lon, d.profileId] : [d.name, lat, lon];
    });
  }
  return data;
}

/** Lo común de un enlace; null si algo no sirve. */
export function readMapShare(data: Record<string, unknown>, options: MapShareOptions): MapShareCommon | null {
  const site = data.s === undefined ? null : readPosition(data.s);
  const name = data.n === undefined ? '' : readText(data.n, SITE_NAME_MAX);
  const radiusKm = data.r ?? options.defaultRadiusKm;
  const thresholds = readThresholds(data.u, options.thresholds);
  const readDevice = (v: unknown): SharedDevice | null => {
    if (!Array.isArray(v) || v.length < 3 || v.length > 4) return null;
    const deviceName = readText(v[0], DEVICE_NAME_MAX);
    const position = readPosition([v[1], v[2]]);
    const profileId = v[3] ?? null;
    if (deviceName === null || !position || (profileId !== null && !options.profileIds.includes(profileId))) return null;
    return { name: deviceName, position, profileId };
  };
  const devices = data.e === undefined ? [] : readList(data.e, readDevice);
  if ((data.s !== undefined && !site) || name === null || !thresholds || !devices) return null;
  if (!isFiniteNumber(radiusKm) || radiusKm < MIN_RADIUS_KM || radiusKm > options.maxRadiusKm) return null;
  return { site, name, radiusKm, thresholds, devices };
}

// --- Perfil elegido (radio de usuario, sensor…) ---

export interface ProfileShareOptions<P extends { id: string }, V extends object> {
  profiles: readonly P[];
  defaultProfile: P;
  /** Id de "Personalizado". */
  customId: string;
  specs: readonly NumberFieldSpec<Extract<keyof V, string>>[];
  valuesOf(profile: P): V;
  /** El perfil "Personalizado" con esos valores. */
  custom(values: V): P;
}

/** p el perfil (si no es el de siempre) y pv lo que cambió de sus valores si es "Personalizado". */
export function profileShareData<P extends { id: string }, V extends object>(current: P, options: ProfileShareOptions<P, V>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (current.id !== options.defaultProfile.id) data.p = current.id;
  if (current.id === options.customId) data.pv = changedFields(options.valuesOf(current), options.valuesOf(options.defaultProfile));
  return data;
}

/** El perfil del enlace; null si no existe o sus valores no sirven. */
export function readSharedProfile<P extends { id: string }, V extends object>(data: Record<string, unknown>, options: ProfileShareOptions<P, V>): P | null {
  if (data.p === undefined) return options.defaultProfile;
  if (data.p === options.customId) {
    const values = readFields(data.pv, options.specs, options.valuesOf(options.defaultProfile));
    return values && options.custom(values);
  }
  return options.profiles.find((p) => p.id === data.p) ?? null;
}
