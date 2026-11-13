// Datos de /terreno para el enlace de "Compartir": lo común de las páginas con mapa (sitio,
// umbrales, equipos), las dos cadenas, el radio de usuario y la capacidad. Solo viaja lo que
// cambió frente a los valores por omisión de la banda, así el enlace queda corto. La banda, la
// confiabilidad y el entorno ya van en la dirección (?banda=800&entorno=urbano). Módulo puro.

import { CUSTOM_PROFILE_ID, DEFAULT_RADIO_PROFILE_ID, DEFAULT_RADIUS_KM, RADIO_PROFILES, type LmrBand } from '../../data/defaults';
import { isRecord } from '../../export/projectFile';
import { changedFields, readFields } from '../../export/shareLink';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../../rf/linkBudget';
import { RADIO_FIELDS, RX_FIELDS, TX_FIELDS, type RadioValues } from '../../ui/chainForms';
import { CAPACITY_FIELDS, type CapacityValues } from '../../ui/trunkingCapacity';
import {
  LEVEL_THRESHOLDS,
  mapShareData,
  profileShareData,
  readMapShare,
  readSharedProfile,
  type MapShareCommon,
  type MapShareOptions,
  type ProfileShareOptions,
} from '../shared/mapShare';

export type { SharedDevice } from '../shared/mapShare';

export interface TerrainShare extends MapShareCommon {
  tx: SiteTxChain;
  rx: SiteRxChain;
  radio: RadioProfile;
  /** Solo los campos de "Capacidad" que escribió el usuario. */
  capacity: Partial<CapacityValues>;
}

const MAP_OPTIONS: MapShareOptions = {
  defaultRadiusKm: DEFAULT_RADIUS_KM,
  maxRadiusKm: 100,
  thresholds: LEVEL_THRESHOLDS,
  profileIds: RADIO_PROFILES.map((p) => p.id),
};

const RADIO_OPTIONS: ProfileShareOptions<RadioProfile, RadioValues> = {
  profiles: RADIO_PROFILES,
  defaultProfile: RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!,
  customId: CUSTOM_PROFILE_ID,
  specs: RADIO_FIELDS,
  valuesOf: ({ powerW, antennaGainDbd, heightM, bodyLossDb, sensitivityDbm }) => ({ powerW, antennaGainDbd, heightM, bodyLossDb, sensitivityDbm }),
  custom: (values) => ({ ...values, id: CUSTOM_PROFILE_ID, name: 'Personalizado' }),
};

const isEmpty = (o: object) => Object.keys(o).length === 0;

/**
 * Lo que va en el enlace: lo común (s, n, r, u, e), tx y rx las cadenas, p el perfil del radio
 * (pv sus valores si es personalizado) y c la capacidad.
 */
export function terrainShareData(state: TerrainShare, band: LmrBand): Record<string, unknown> {
  const data = { ...mapShareData(state, MAP_OPTIONS), ...profileShareData(state.radio, RADIO_OPTIONS) };
  const tx = changedFields(state.tx, band.tx);
  if (!isEmpty(tx)) data.tx = tx;
  const rx = changedFields(state.rx, band.rx);
  if (!isEmpty(rx)) data.rx = rx;
  if (!isEmpty(state.capacity)) data.c = state.capacity;
  return data;
}

/**
 * Revisa los datos de un enlace de /terreno y los completa con los valores por omisión de la
 * banda. Null si algo no sirve (un número fuera de rango, un perfil que no existe…): la página
 * abre entonces con sus valores de siempre, nunca con una mezcla.
 */
export function readTerrainShare(data: unknown, band: LmrBand): TerrainShare | null {
  if (!isRecord(data)) return null;
  const common = readMapShare(data, MAP_OPTIONS);
  const tx = readFields(data.tx, TX_FIELDS, band.tx);
  const rx = readFields(data.rx, RX_FIELDS, band.rx);
  const radio = readSharedProfile(data, RADIO_OPTIONS);
  const capacity = readFields<Partial<CapacityValues>>(data.c, CAPACITY_FIELDS, {});
  if (!common || !tx || !rx || !radio || !capacity) return null;
  return { ...common, tx, rx, radio, capacity };
}
