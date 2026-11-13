// Datos de /terreno para el enlace de "Compartir": el sitio, las dos cadenas, el radio de usuario,
// los umbrales del mapa, la capacidad y los equipos. Solo viaja lo que cambió frente a los valores
// por omisión de la banda, así el enlace queda corto. La banda, la confiabilidad y el entorno ya
// van en la dirección (?banda=800&entorno=urbano). Módulo puro.

import { DEFAULT_LEVEL_THRESHOLDS_DBM } from '../../coverage/colorScale';
import { CUSTOM_PROFILE_ID, DEFAULT_RADIO_PROFILE_ID, DEFAULT_RADIUS_KM, RADIO_PROFILES, type LmrBand } from '../../data/defaults';
import { isFiniteNumber, isRecord, readList } from '../../export/projectFile';
import { changedFields, positionData, readFields, readPosition, readText } from '../../export/shareLink';
import type { LonLat } from '../../geo/geodesy';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../../rf/linkBudget';
import { RADIO_FIELDS, RX_FIELDS, TX_FIELDS, type RadioValues } from '../../ui/chainForms';
import { CAPACITY_FIELDS, type CapacityValues } from '../../ui/trunkingCapacity';

export interface SharedDevice {
  name: string;
  position: LonLat;
  /** Perfil propio del equipo; null si usa el de "Radio de usuario". */
  profileId: string | null;
}

export interface TerrainShare {
  site: LonLat | null;
  name: string;
  radiusKm: number;
  tx: SiteTxChain;
  rx: SiteRxChain;
  radio: RadioProfile;
  /** Umbrales de la leyenda (dBm), de mayor a menor. */
  thresholds: number[];
  /** Solo los campos de "Capacidad" que escribió el usuario. */
  capacity: Partial<CapacityValues>;
  devices: SharedDevice[];
}

/** Largo máximo del nombre del sitio (el del campo del panel) y del de cada equipo. */
const SITE_NAME_MAX = 60;
const DEVICE_NAME_MAX = 100;
/** Radio de cálculo de /terreno (km). */
const RADIUS_RANGE = { min: 1, max: 100 };
/** Rango de los umbrales que admite la leyenda (dBm). */
const THRESHOLD_RANGE = { min: -150, max: -20 };

const defaultRadio = () => RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;
const isProfileId = (id: unknown): id is string => RADIO_PROFILES.some((p) => p.id === id);

const radioValues = ({ powerW, antennaGainDbd, heightM, bodyLossDb, sensitivityDbm }: RadioProfile): RadioValues => ({
  powerW,
  antennaGainDbd,
  heightM,
  bodyLossDb,
  sensitivityDbm,
});

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const isEmpty = (o: object) => Object.keys(o).length === 0;

/**
 * Lo que va en el enlace. Claves cortas: s sitio [lat, lon], n nombre, r radio de cálculo,
 * tx y rx las cadenas, p el perfil del radio (pv sus valores si es personalizado), u umbrales,
 * c capacidad y e los equipos como [nombre, lat, lon, perfil].
 */
export function terrainShareData(state: TerrainShare, band: LmrBand): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (state.site) data.s = positionData(state.site);
  if (state.name) data.n = state.name;
  if (state.radiusKm !== DEFAULT_RADIUS_KM) data.r = state.radiusKm;
  const tx = changedFields(state.tx, band.tx);
  if (!isEmpty(tx)) data.tx = tx;
  const rx = changedFields(state.rx, band.rx);
  if (!isEmpty(rx)) data.rx = rx;
  if (state.radio.id !== DEFAULT_RADIO_PROFILE_ID) data.p = state.radio.id;
  if (state.radio.id === CUSTOM_PROFILE_ID) data.pv = changedFields(radioValues(state.radio), radioValues(defaultRadio()));
  if (!sameList(state.thresholds, DEFAULT_LEVEL_THRESHOLDS_DBM)) data.u = state.thresholds;
  if (!isEmpty(state.capacity)) data.c = state.capacity;
  if (state.devices.length > 0) {
    data.e = state.devices.map((d) => {
      const [lat, lon] = positionData(d.position);
      return d.profileId ? [d.name, lat, lon, d.profileId] : [d.name, lat, lon];
    });
  }
  return data;
}

function readRadio(id: unknown, values: unknown): RadioProfile | null {
  if (id === undefined) return defaultRadio();
  if (id === CUSTOM_PROFILE_ID) {
    const read = readFields(values, RADIO_FIELDS, radioValues(defaultRadio()));
    return read && { ...read, id: CUSTOM_PROFILE_ID, name: 'Personalizado' };
  }
  return RADIO_PROFILES.find((p) => p.id === id) ?? null;
}

function readDevice(v: unknown): SharedDevice | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > 4) return null;
  const name = readText(v[0], DEVICE_NAME_MAX);
  const position = readPosition([v[1], v[2]]);
  const profileId = v[3] ?? null;
  if (name === null || !position || (profileId !== null && !isProfileId(profileId))) return null;
  return { name, position, profileId };
}

function readThresholds(v: unknown): number[] | null {
  if (v === undefined) return [...DEFAULT_LEVEL_THRESHOLDS_DBM];
  const list = readList(v, (n) => (isFiniteNumber(n) && n >= THRESHOLD_RANGE.min && n <= THRESHOLD_RANGE.max ? n : null));
  return list && list.length === DEFAULT_LEVEL_THRESHOLDS_DBM.length ? list : null;
}

/**
 * Revisa los datos de un enlace de /terreno y los completa con los valores por omisión de la
 * banda. Null si algo no sirve (un número fuera de rango, un perfil que no existe…): la página
 * abre entonces con sus valores de siempre, nunca con una mezcla.
 */
export function readTerrainShare(data: unknown, band: LmrBand): TerrainShare | null {
  if (!isRecord(data)) return null;
  const site = data.s === undefined ? null : readPosition(data.s);
  const name = data.n === undefined ? '' : readText(data.n, SITE_NAME_MAX);
  const radiusKm = data.r ?? DEFAULT_RADIUS_KM;
  const tx = readFields(data.tx, TX_FIELDS, band.tx);
  const rx = readFields(data.rx, RX_FIELDS, band.rx);
  const radio = readRadio(data.p, data.pv);
  const thresholds = readThresholds(data.u);
  const capacity = readFields<Partial<CapacityValues>>(data.c, CAPACITY_FIELDS, {});
  const devices = data.e === undefined ? [] : readList(data.e, readDevice);
  if ((data.s !== undefined && !site) || name === null || !tx || !rx || !radio || !thresholds || !capacity || !devices) return null;
  if (!isFiniteNumber(radiusKm) || radiusKm < RADIUS_RANGE.min || radiusKm > RADIUS_RANGE.max) return null;
  return { site, name, radiusKm, tx, rx, radio, thresholds, capacity, devices };
}
