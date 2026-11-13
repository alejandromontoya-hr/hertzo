// Datos de /radiodifusion para el enlace de "Compartir": lo común de las páginas con mapa (el
// transmisor, su nombre, el radio de cálculo, los umbrales en dBµV/m y los receptores), la
// emisora FM, la AM, la antena AM y el suelo. Solo viaja lo que cambió. El servicio (FM o AM), la confiabilidad y el
// entorno ya van en la dirección (?servicio=am). Módulo puro.

import { isRecord } from '../../export/projectFile';
import { changedFields, readFields } from '../../export/shareLink';
import { AM_ANTENNAS, GROUND_TYPES } from '../../rf/groundwave';
import { mapShareData, readMapShare, type MapShareCommon, type MapShareOptions } from '../shared/mapShare';
import {
  AM_FIELDS,
  DEFAULT_AM,
  DEFAULT_AM_ANTENNA_INDEX,
  DEFAULT_FM,
  DEFAULT_GROUND_ID,
  FM_FIELDS,
  MAX_RADIUS_KM,
  SERVICE,
  THRESHOLD_RANGE,
  type AmStation,
  type FmStation,
  type Service,
} from './broadcastFields';

/** El transmisor, su nombre, el radio de cálculo, los umbrales (dBµV/m) y los receptores (sin tipo). */
export interface BroadcastShare extends MapShareCommon {
  fm: FmStation;
  am: AmStation;
  amAntennaId: string;
  groundId: string;
}

/** Radio de cálculo y umbrales de siempre dependen del servicio: 60 km en FM y 150 km en AM. */
const mapOptions = (service: Service): MapShareOptions => ({
  defaultRadiusKm: SERVICE[service].radiusKm,
  maxRadiusKm: MAX_RADIUS_KM,
  thresholds: { defaults: SERVICE[service].thresholds, ...THRESHOLD_RANGE },
  profileIds: [],
});

const DEFAULT_ANTENNA_ID = AM_ANTENNAS[DEFAULT_AM_ANTENNA_INDEX]!.id;
const isEmpty = (o: object) => Object.keys(o).length === 0;

/**
 * Lo que va en el enlace: lo común (s, n, r, u, e), f la emisora FM, am la AM, an la antena AM y
 * g el suelo.
 */
export function broadcastShareData(state: BroadcastShare, service: Service): Record<string, unknown> {
  const data = mapShareData(state, mapOptions(service));
  const fm = changedFields(state.fm, DEFAULT_FM);
  if (!isEmpty(fm)) data.f = fm;
  const am = changedFields(state.am, DEFAULT_AM);
  if (!isEmpty(am)) data.am = am;
  if (state.amAntennaId !== DEFAULT_ANTENNA_ID) data.an = state.amAntennaId;
  if (state.groundId !== DEFAULT_GROUND_ID) data.g = state.groundId;
  return data;
}

/** Revisa los datos de un enlace de /radiodifusion; null si algo no sirve (la página abre como siempre). */
export function readBroadcastShare(data: unknown, service: Service): BroadcastShare | null {
  if (!isRecord(data)) return null;
  const common = readMapShare(data, mapOptions(service));
  const fm = readFields(data.f, FM_FIELDS, DEFAULT_FM);
  const am = readFields(data.am, AM_FIELDS, DEFAULT_AM);
  const amAntennaId = data.an ?? DEFAULT_ANTENNA_ID;
  const groundId = data.g ?? DEFAULT_GROUND_ID;
  if (!common || !fm || !am) return null;
  if (!AM_ANTENNAS.some((a) => a.id === amAntennaId) || !GROUND_TYPES.some((g) => g.id === groundId)) return null;
  return { ...common, fm, am, amAntennaId: amAntennaId as string, groundId: groundId as string };
}
