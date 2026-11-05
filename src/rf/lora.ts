// Física de LoRa: sensibilidad por factor de dispersión (SF), tiempo en el aire y el SF más
// rápido que alcanza con un nivel dado. Módulo puro: sin dependencias de la interfaz.

export type SpreadingFactor = 7 | 8 | 9 | 10 | 11 | 12;

export const SPREADING_FACTORS: readonly SpreadingFactor[] = [7, 8, 9, 10, 11, 12];

/** Relación señal/ruido mínima para demodular cada SF (dB), según la hoja de datos del Semtech SX1276. */
export const LORA_SNR_LIMIT_DB: Readonly<Record<SpreadingFactor, number>> = {
  7: -7.5,
  8: -10,
  9: -12.5,
  10: -15,
  11: -17.5,
  12: -20,
};

/** Figura de ruido típica del receptor de un nodo (dB). */
export const DEFAULT_LORA_NOISE_FIGURE_DB = 6;

/** Ruido térmico a 290 K (dBm/Hz). */
const THERMAL_NOISE_DBM_PER_HZ = -174;

/**
 * Sensibilidad del receptor (dBm) = −174 + 10·log10(BW en Hz) + figura de ruido + SNR límite.
 * SF12 a 125 kHz con NF 6 dB: −137,03 dBm; SF7: −124,53 dBm.
 */
export function loraSensitivityDbm(
  sf: SpreadingFactor,
  bandwidthKHz: number,
  noiseFigureDb: number = DEFAULT_LORA_NOISE_FIGURE_DB,
): number {
  if (!(bandwidthKHz > 0)) throw new RangeError(`El ancho de banda debe ser mayor que 0 kHz (se recibió ${bandwidthKHz} kHz).`);
  return THERMAL_NOISE_DBM_PER_HZ + 10 * Math.log10(bandwidthKHz * 1000) + noiseFigureDb + LORA_SNR_LIMIT_DB[sf];
}

export interface LoraPacket {
  spreadingFactor: SpreadingFactor;
  bandwidthKHz: number;
  /** Bytes de la trama completa (en LoRaWAN, la carga útil más 13 bytes de encabezado y MIC). */
  payloadBytes: number;
  /** Tasa de codificación 4/5 … 4/8, dada como 1 … 4. LoRaWAN usa 4/5 (1). */
  codingRate?: 1 | 2 | 3 | 4;
  preambleSymbols?: number;
  /** Encabezado implícito: LoRaWAN siempre usa el explícito (false). */
  implicitHeader?: boolean;
  crc?: boolean;
}

/**
 * Tiempo en el aire de una trama (ms), según la nota de aplicación AN1200.13 de Semtech.
 * La optimización para tasas bajas se activa sola cuando un símbolo dura más de 16 ms
 * (SF11 y SF12 a 125 kHz). SF7 a 125 kHz con 20 bytes: 56,576 ms; SF12: 1318,912 ms.
 */
export function loraTimeOnAirMs({
  spreadingFactor: sf,
  bandwidthKHz,
  payloadBytes,
  codingRate = 1,
  preambleSymbols = 8,
  implicitHeader = false,
  crc = true,
}: LoraPacket): number {
  if (!(bandwidthKHz > 0)) throw new RangeError(`El ancho de banda debe ser mayor que 0 kHz (se recibió ${bandwidthKHz} kHz).`);
  const symbolMs = 2 ** sf / bandwidthKHz;
  const lowDataRate = symbolMs > 16 ? 1 : 0;
  const preambleMs = (preambleSymbols + 4.25) * symbolMs;
  const numerator = 8 * payloadBytes - 4 * sf + 28 + 16 * (crc ? 1 : 0) - 20 * (implicitHeader ? 1 : 0);
  const payloadSymbols = 8 + Math.max(Math.ceil(numerator / (4 * (sf - 2 * lowDataRate))) * (codingRate + 4), 0);
  return preambleMs + payloadSymbols * symbolMs;
}

/**
 * El SF más rápido (el menor) cuya sensibilidad alcanza el nivel recibido, o null si ni SF12
 * alcanza. A 125 kHz: −120 dBm → SF7; −130 dBm → SF10; −138 dBm → null.
 */
export function minimumSpreadingFactor(
  receivedDbm: number,
  bandwidthKHz: number,
  noiseFigureDb: number = DEFAULT_LORA_NOISE_FIGURE_DB,
): SpreadingFactor | null {
  return SPREADING_FACTORS.find((sf) => receivedDbm >= loraSensitivityDbm(sf, bandwidthKHz, noiseFigureDb)) ?? null;
}
