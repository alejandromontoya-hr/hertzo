// Datos de /lora para el enlace de "Compartir": lo común de las páginas con mapa (gateway como
// sitio, umbrales, medidores), la antena y el cable del gateway, el sensor, los datos por mensaje,
// el margen del ADR y la capacidad. Solo viaja lo que cambió. El plan de frecuencias, el límite de
// 400 ms, la confiabilidad y el entorno ya van en la dirección (?banda=au915&tiempo=400). Módulo puro.

import { DEFAULT_LORA_GATEWAY, DEFAULT_LORA_SENSOR_ID, LORA_SENSORS, type LoraGateway, type LoraSensor } from '../../data/lora';
import { isRecord } from '../../export/projectFile';
import { changedFields, inFieldRange, readFields } from '../../export/shareLink';
import { DEFAULT_ADR_MARGIN_DB, SPREADING_FACTORS, type SpreadingFactor } from '../../rf/lora';
import { LORA_CAPACITY_FIELDS, type LoraCapacityChanges } from '../../ui/loraCapacity';
import {
  mapShareData,
  profileShareData,
  readMapShare,
  readSharedProfile,
  type MapShareCommon,
  type MapShareOptions,
  type ProfileShareOptions,
} from '../shared/mapShare';
import {
  ADR_MARGIN_FIELD,
  CUSTOM_SENSOR_ID,
  DEFAULT_PAYLOAD_BYTES,
  DEFAULT_RADIUS_KM,
  GATEWAY_FIELDS,
  PAYLOAD_FIELD,
  SENSOR_FIELDS,
  type SensorValues,
} from './loraFields';

export interface LoraShare extends MapShareCommon {
  gateway: LoraGateway;
  sensor: LoraSensor;
  payloadBytes: number;
  adrMarginDb: number;
  /** Solo lo que cambió el usuario en "Capacidad". */
  capacity: LoraCapacityChanges;
}

const MAP_OPTIONS: MapShareOptions = {
  defaultRadiusKm: DEFAULT_RADIUS_KM,
  maxRadiusKm: 100,
  profileIds: LORA_SENSORS.map((s) => s.id),
};

const SENSOR_OPTIONS: ProfileShareOptions<LoraSensor, SensorValues> = {
  profiles: LORA_SENSORS,
  defaultProfile: LORA_SENSORS.find((s) => s.id === DEFAULT_LORA_SENSOR_ID)!,
  customId: CUSTOM_SENSOR_ID,
  specs: SENSOR_FIELDS,
  valuesOf: ({ powerW, antennaGainDbd, heightM, enclosureLossDb, noiseFigureDb }) => ({ powerW, antennaGainDbd, heightM, enclosureLossDb, noiseFigureDb }),
  custom: (values) => ({ ...values, id: CUSTOM_SENSOR_ID, name: 'Personalizado' }),
};

const isEmpty = (o: object) => Object.keys(o).length === 0;

/**
 * Lo que va en el enlace: lo común (s, n, r, u, e), g el gateway, p el sensor (pv sus valores si
 * es personalizado), b los datos por mensaje, m el margen del ADR y c la capacidad.
 */
export function loraShareData(state: LoraShare): Record<string, unknown> {
  const data = { ...mapShareData(state, MAP_OPTIONS), ...profileShareData(state.sensor, SENSOR_OPTIONS) };
  const gateway = changedFields(state.gateway, DEFAULT_LORA_GATEWAY);
  if (!isEmpty(gateway)) data.g = gateway;
  if (state.payloadBytes !== DEFAULT_PAYLOAD_BYTES) data.b = state.payloadBytes;
  if (state.adrMarginDb !== DEFAULT_ADR_MARGIN_DB) data.m = state.adrMarginDb;
  if (!isEmpty(state.capacity)) data.c = state.capacity;
  return data;
}

const isSpreadingFactor = (v: unknown): v is SpreadingFactor => SPREADING_FACTORS.includes(v as SpreadingFactor);

function readCapacity(v: unknown): LoraCapacityChanges | null {
  if (v === undefined) return {};
  if (!isRecord(v)) return null;
  const values = readFields<LoraCapacityChanges>(v, LORA_CAPACITY_FIELDS, {});
  if (!values) return null;
  if (v.sf === undefined) return values;
  return isSpreadingFactor(v.sf) ? { ...values, sf: v.sf } : null;
}

/** Revisa los datos de un enlace de /lora; null si algo no sirve (la página abre como siempre). */
export function readLoraShare(data: unknown): LoraShare | null {
  if (!isRecord(data)) return null;
  const common = readMapShare(data, MAP_OPTIONS);
  const gateway = readFields(data.g, GATEWAY_FIELDS, DEFAULT_LORA_GATEWAY);
  const sensor = readSharedProfile(data, SENSOR_OPTIONS);
  const payloadBytes = data.b ?? DEFAULT_PAYLOAD_BYTES;
  const adrMarginDb = data.m ?? DEFAULT_ADR_MARGIN_DB;
  const capacity = readCapacity(data.c);
  if (!common || !gateway || !sensor || !capacity) return null;
  if (!inFieldRange(payloadBytes, PAYLOAD_FIELD) || !Number.isInteger(payloadBytes) || !inFieldRange(adrMarginDb, ADR_MARGIN_FIELD)) return null;
  return { ...common, gateway, sensor, payloadBytes, adrMarginDb, capacity };
}
