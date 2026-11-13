// Campos del panel de /lora: gateway, sensor, datos por mensaje y margen del ADR, con sus rangos.
// Los usan el formulario y el enlace de "Compartir" (que no acepta un valor fuera de rango).

import type { LoraGateway, LoraSensor } from '../../data/lora';
import type { NumberFieldSpec } from '../../ui/fields';

export const DEFAULT_PAYLOAD_BYTES = 11;
export const DEFAULT_RADIUS_KM = 20;
export const CUSTOM_SENSOR_ID = 'personalizado';

export type GatewayValues = Omit<LoraGateway, never>;
export type SensorValues = Omit<LoraSensor, 'id' | 'name'>;

export const GATEWAY_FIELDS: readonly NumberFieldSpec<keyof GatewayValues>[] = [
  {
    key: 'powerW',
    label: 'Potencia',
    unit: 'W',
    min: 0,
    max: 10,
    minExclusive: true,
    hint: 'En Colombia (915–928 MHz), máximo 1 W a la salida del equipo con antena de hasta 6 dBi; con más ganancia, la potencia baja lo mismo que sobra (ANE, Resolución 105 de 2020, anexo 3.6.1.1).',
  },
  { key: 'lineLengthM', label: 'Longitud del cable', unit: 'm', min: 0, max: 200 },
  { key: 'lineLossDbPer100m', label: 'Pérdida del cable', unit: 'dB/100 m', min: 0, max: 50 },
  { key: 'connectorLossDb', label: 'Pérdida de conectores', unit: 'dB', min: 0, max: 10 },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena', unit: 'dBd', min: -10, max: 20 },
  { key: 'antennaHeightM', label: 'Altura de la antena', unit: 'm', min: 0.5, max: 1000 },
  {
    key: 'noiseFigureDb',
    label: 'Figura de ruido',
    unit: 'dB',
    min: 0,
    max: 20,
    hint: 'Ruido que agrega el receptor. Con 4 dB el gateway oye SF12 hasta −139 dBm, como el Semtech SX1302.',
  },
];

export const SENSOR_FIELDS: readonly NumberFieldSpec<keyof SensorValues>[] = [
  { key: 'powerW', label: 'Potencia', unit: 'W', min: 0, max: 1, minExclusive: true },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena', unit: 'dBd', min: -20, max: 10 },
  { key: 'heightM', label: 'Altura de la antena', unit: 'm', min: 0.5, max: 100 },
  {
    key: 'enclosureLossDb',
    label: 'Pérdida por la caja',
    unit: 'dB',
    min: 0,
    max: 40,
    hint: 'Lo que atenúa la caja, la tapa o el muro que rodea al sensor. Aplica en bajada y en subida.',
  },
  { key: 'noiseFigureDb', label: 'Figura de ruido', unit: 'dB', min: 0, max: 20 },
];

export const PAYLOAD_FIELD: NumberFieldSpec<'payloadBytes'> = {
  key: 'payloadBytes',
  label: 'Datos por mensaje',
  unit: 'bytes',
  min: 1,
  max: 222,
  hint: 'Lo que manda el sensor en cada mensaje. LoRaWAN le suma 13 bytes de encabezado.',
};

export const ADR_MARGIN_FIELD: NumberFieldSpec<'adrMarginDb'> = {
  key: 'adrMarginDb',
  label: 'Margen del ADR',
  unit: 'dB',
  min: 0,
  max: 30,
  hint: 'Lo que la red deja de sobra sobre la sensibilidad al elegir el SF de cada sensor. ChirpStack usa 10 dB y The Things Stack 15 dB. Con más margen el SF es más lento: más alcance seguro, pero más tiempo en el aire.',
};
