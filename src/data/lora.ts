// Bandas LoRaWAN, gateway y sensores de ejemplo. Son valores típicos: ajústalos a los equipos
// y mediciones de cada red. Se traducen a las mismas cadenas del balance de enlace de radio
// profesional, así la bajada (gateway → sensor) y la subida (sensor → gateway) usan el mismo cálculo.

import { loraSensitivityDbm, type SpreadingFactor } from '../rf/lora';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../rf/linkBudget';

export type LoraBandId = 'au915' | 'us915' | 'eu868';

export interface LoraChannel {
  frequencyMHz: number;
  bandwidthKHz: number;
}

export interface LoraBand {
  id: LoraBandId;
  label: string;
  range: string;
  /** Sensor → gateway. */
  uplink: LoraChannel;
  /** Gateway → sensor. */
  downlink: LoraChannel;
  description: string;
  /** SF más lento de la subida a 125 kHz que define el plan (DR0 de RP002-1.0.3): SF10 en US915, SF12 en los demás. */
  maxUplinkSf: SpreadingFactor;
  /** La norma limita siempre cada mensaje de subida a 400 ms en el aire (FCC 15.247 en US915). */
  alwaysDwellLimited: boolean;
  regulation: LoraRegulation;
}

/** Topes legales de la banda: ERP máxima (dBm) en el canal de subida y en el de bajada. */
export interface LoraRegulation {
  uplinkMaxErpDbm: number;
  downlinkMaxErpDbm: number;
  /** Ciclo de trabajo máximo de cada sensor en el canal de subida (%), si la norma lo pide. */
  uplinkDutyCyclePct?: number;
  /** Norma que fija los topes, para citarla en el aviso. */
  source: string;
}

/**
 * Planes de canales de la LoRa Alliance (RP002-1.0.3). Colombia usa AU915-928. En AU915 y US915
 * la subida va en canales de 125 kHz y la bajada en canales de 500 kHz, por eso la bajada
 * pierde unos 6 dB de sensibilidad frente a la subida con el mismo SF.
 */
export const LORA_BANDS: readonly LoraBand[] = [
  {
    id: 'au915',
    label: 'AU915',
    range: '915–928 MHz',
    uplink: { frequencyMHz: 916.8, bandwidthKHz: 125 },
    downlink: { frequencyMHz: 923.3, bandwidthKHz: 500 },
    description: 'Plan de Colombia, Australia y gran parte de Latinoamérica.',
    maxUplinkSf: 12,
    alwaysDwellLimited: false,
    // 1 W conducido con antena de hasta 6 dBi: 36 dBm PIRE = 33,85 dBm ERP.
    regulation: { uplinkMaxErpDbm: 33.85, downlinkMaxErpDbm: 33.85, source: 'ANE, Resolución 105 de 2020: 1 W con antena de hasta 6 dBi' },
  },
  {
    id: 'us915',
    label: 'US915',
    range: '902–928 MHz',
    uplink: { frequencyMHz: 903.9, bandwidthKHz: 125 },
    downlink: { frequencyMHz: 923.3, bandwidthKHz: 500 },
    description: 'Plan de Estados Unidos, Canadá y México. La subida llega hasta SF10 (DR0) y cada mensaje dura como máximo 400 ms.',
    maxUplinkSf: 10,
    alwaysDwellLimited: true,
    regulation: { uplinkMaxErpDbm: 33.85, downlinkMaxErpDbm: 33.85, source: 'FCC 15.247: 1 W con antena de hasta 6 dBi' },
  },
  {
    id: 'eu868',
    label: 'EU868',
    range: '863–870 MHz',
    uplink: { frequencyMHz: 868.1, bandwidthKHz: 125 },
    downlink: { frequencyMHz: 869.525, bandwidthKHz: 125 },
    description: 'Plan de Europa: la bajada usa el canal de 869,525 MHz.',
    maxUplinkSf: 12,
    alwaysDwellLimited: false,
    // 868,0–868,6 MHz: 25 mW ERP y 1 % del tiempo; 869,4–869,65 MHz: 500 mW ERP.
    regulation: {
      uplinkMaxErpDbm: 14,
      downlinkMaxErpDbm: 27,
      uplinkDutyCyclePct: 1,
      source: 'ERC 70-03 y EN 300 220: 25 mW ERP en 868,0–868,6 MHz y 500 mW ERP en 869,4–869,65 MHz',
    },
  },
];

export const DEFAULT_LORA_BAND_ID: LoraBandId = 'au915';

export interface LoraGateway {
  powerW: number;
  lineLengthM: number;
  lineLossDbPer100m: number;
  connectorLossDb: number;
  antennaGainDbd: number;
  antennaHeightM: number;
  /** Figura de ruido del receptor (dB): con 4 dB, SF12 a 125 kHz da −139 dBm, como el Semtech SX1302. */
  noiseFigureDb: number;
}

/**
 * Gateway de 27 dBm (0,5 W), 10 m de LMR-400 (~12,8 dB/100 m a 900 MHz) y omni de 3 dBd a 30 m.
 * Cumple el límite de Colombia en 915–928 MHz: hasta 1 W conducido con antena de hasta 6 dBi
 * (ANE, Resolución 105 de 2020, anexo 3.6.1.1); aquí 0,5 W con 5,15 dBi.
 */
export const DEFAULT_LORA_GATEWAY: LoraGateway = {
  powerW: 0.5,
  lineLengthM: 10,
  lineLossDbPer100m: 12.8,
  connectorLossDb: 0.5,
  antennaGainDbd: 3,
  antennaHeightM: 30,
  noiseFigureDb: 4,
};

export interface LoraSensor {
  id: string;
  name: string;
  powerW: number;
  antennaGainDbd: number;
  /** El ITM acepta desde 0,5 m. */
  heightM: number;
  /** Pérdida por la caja, el poste o lo que rodea al sensor (dB). Aplica en las dos direcciones. */
  enclosureLossDb: number;
  noiseFigureDb: number;
}

export const LORA_SENSORS: readonly LoraSensor[] = [
  {
    id: 'poste',
    name: 'Sensor en poste (2 m)',
    powerW: 0.1,
    antennaGainDbd: 0,
    heightM: 2,
    enclosureLossDb: 0,
    noiseFigureDb: 6,
  },
  {
    id: 'medidor-caja',
    name: 'Medidor en caja',
    powerW: 0.025,
    antennaGainDbd: -3,
    heightM: 0.5,
    enclosureLossDb: 15,
    noiseFigureDb: 6,
  },
];

export const DEFAULT_LORA_SENSOR_ID = 'poste';

/** Bajada: cadena de transmisión del gateway en el canal de bajada de la banda. */
export function gatewayTxChain(band: LoraBand, gw: LoraGateway): SiteTxChain {
  return {
    frequencyMHz: band.downlink.frequencyMHz,
    transmitterPowerW: gw.powerW,
    combinerLossDb: 0,
    lineLengthM: gw.lineLengthM,
    lineLossDbPer100m: gw.lineLossDbPer100m,
    connectorLossDb: gw.connectorLossDb,
    antennaGainDbd: gw.antennaGainDbd,
    antennaHeightM: gw.antennaHeightM,
  };
}

/**
 * Subida: cadena de recepción del gateway, con la sensibilidad del SF más lento permitido en
 * el canal de subida: SF12, o menos si la red limita el tiempo en el aire (400 ms en AU915).
 */
export function gatewayRxChain(band: LoraBand, gw: LoraGateway, maxSf: SpreadingFactor = 12): SiteRxChain {
  return {
    frequencyMHz: band.uplink.frequencyMHz,
    antennaGainDbd: gw.antennaGainDbd,
    antennaHeightM: gw.antennaHeightM,
    towerAmplifierGainDb: 0,
    lineLengthM: gw.lineLengthM,
    lineLossDbPer100m: gw.lineLossDbPer100m,
    multicouplerLossDb: gw.connectorLossDb,
    receiverSensitivityDbm: loraSensitivityDbm(maxSf, band.uplink.bandwidthKHz, gw.noiseFigureDb),
  };
}

/** El sensor como radio de usuario, con la sensibilidad de SF12 en el canal de bajada. */
export function sensorRadioProfile(band: LoraBand, sensor: LoraSensor): RadioProfile {
  return {
    id: sensor.id,
    name: sensor.name,
    powerW: sensor.powerW,
    antennaGainDbd: sensor.antennaGainDbd,
    heightM: sensor.heightM,
    bodyLossDb: sensor.enclosureLossDb,
    sensitivityDbm: loraSensitivityDbm(12, band.downlink.bandwidthKHz, sensor.noiseFigureDb),
  };
}
