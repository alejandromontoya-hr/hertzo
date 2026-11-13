// Bandas, modelos y campos del panel de /celular, con sus rangos y valores típicos. Los usan el
// formulario y el enlace de "Compartir" (que no acepta un valor fuera de rango).

import { HATA_ENVIRONMENTS, type HataEnvironment, type SectorAntenna } from '../../rf/cellular';
import type { NumberFieldSpec } from '../../ui/fields';
import type { ThresholdSpec } from '../shared/mapShare';

export interface Band {
  id: string;
  label: string;
  /** Frecuencia central de bajada (MHz). */
  frequencyMHz: number;
  /** Frecuencia central de subida (MHz); en TDD (n78) es la misma. */
  uplinkMHz: number;
  carrier: string;
  description: string;
  /** Valores típicos del sitio y la antena en esta banda, si son distintos de los de LTE macro. */
  site?: Partial<SiteParams>;
  antenna?: Partial<SectorAntenna>;
}

export const BANDS: readonly Band[] = [
  { id: '700', label: '700', frequencyMHz: 780, uplinkMHz: 725.5, carrier: 'lte10', description: 'Banda 28 (APT 700): bajada 758–803 MHz y subida 703–748 MHz.' },
  { id: '850', label: '850', frequencyMHz: 880, uplinkMHz: 836.5, carrier: 'lte10', description: 'Banda 5: bajada 869–894 MHz y subida 824–849 MHz.' },
  { id: '1900', label: '1900', frequencyMHz: 1960, uplinkMHz: 1880, carrier: 'lte15', description: 'Banda 2 (PCS): bajada 1930–1990 MHz y subida 1850–1910 MHz.' },
  { id: 'aws', label: 'AWS', frequencyMHz: 2130, uplinkMHz: 1745, carrier: 'lte20', description: 'Bandas 4 y 66 (AWS): bajada 2110–2200 MHz y subida 1710–1780 MHz.' },
  { id: '2600', label: '2600', frequencyMHz: 2650, uplinkMHz: 2535, carrier: 'lte20', description: 'Banda 7: bajada 2620–2690 MHz y subida 2500–2570 MHz.' },
  {
    id: '3500',
    label: '3500',
    frequencyMHz: 3500,
    uplinkMHz: 3500,
    carrier: 'nr80',
    description: 'Banda n78 (5G NR): 3300–3800 MHz. Antena activa (AAU 64T64R): unos 200 W, 24 dBi y sin cable, como la Ericsson AIR 6449.',
    site: { powerW: 200, cableLossDb: 0 },
    antenna: { gainDbi: 24, verticalBeamwidthDeg: 10 },
  },
];

export type ModelId = `hata-${HataEnvironment}` | 'uma' | 'itm';

export const MODELS: readonly { id: ModelId; label: string }[] = [
  ...HATA_ENVIRONMENTS.map((e) => ({ id: `hata-${e.id}` as ModelId, label: `Hata / COST-231 · ${e.label}` })),
  { id: 'uma', label: '3GPP 38.901 · macrocelda urbana (sin línea de vista)' },
  { id: 'itm', label: 'ITM con terreno (rural y montaña)' },
];

export interface SiteParams {
  antennaHeightM: number;
  powerW: number;
  cableLossDb: number;
  ueHeightM: number;
  noiseFigureDb: number;
  /** Subida: potencia del teléfono (W), bloques asignados, ruido de la torre y margen de interferencia. */
  uePowerW: number;
  uplinkResourceBlocks: number;
  siteNoiseFigureDb: number;
  uplinkInterferenceDb: number;
}

export const SITE_FIELDS: readonly NumberFieldSpec<keyof SiteParams>[] = [
  { key: 'antennaHeightM', label: 'Altura de las antenas', unit: 'm', min: 1, max: 300 },
  { key: 'powerW', label: 'Potencia por sector', unit: 'W', min: 0, max: 400, minExclusive: true },
  { key: 'cableLossDb', label: 'Pérdida de cable y conectores', unit: 'dB', min: 0, max: 20 },
  { key: 'ueHeightM', label: 'Altura del teléfono', unit: 'm', min: 0.5, max: 30 },
  { key: 'noiseFigureDb', label: 'Figura de ruido del teléfono', unit: 'dB', min: 0, max: 15 },
  {
    key: 'uePowerW',
    label: 'Potencia del teléfono (subida)',
    unit: 'W',
    min: 0,
    max: 2,
    minExclusive: true,
    hint: '0,2 W (23 dBm) es la clase 3 de 3GPP, la de casi todos los teléfonos.',
  },
  {
    key: 'uplinkResourceBlocks',
    label: 'Bloques de subida en el borde',
    unit: 'bloques',
    min: 1,
    max: 273,
    hint: 'En el borde la torre le da pocos bloques al teléfono para que concentre su potencia: con 2 bloques (360 kHz en LTE) alcanza para voz y datos lentos. Más bloques es más caudal, pero menos SINR en cada uno.',
  },
  {
    key: 'siteNoiseFigureDb',
    label: 'Figura de ruido de la torre',
    unit: 'dB',
    min: 0,
    max: 15,
    hint: '5 dB es el valor de las simulaciones de 3GPP (TR 36.814).',
  },
  {
    key: 'uplinkInterferenceDb',
    label: 'Margen por interferencia de subida',
    unit: 'dB',
    min: 0,
    max: 20,
    hint: 'Lo que sube el ruido en la torre por los teléfonos de las celdas vecinas: 3 dB es un valor típico de diseño; con mucha carga, 5 a 6 dB.',
  },
];

export const ANTENNA_FIELDS: readonly NumberFieldSpec<keyof SectorAntenna>[] = [
  { key: 'gainDbi', label: 'Ganancia', unit: 'dBi', min: -5, max: 30 },
  { key: 'horizontalBeamwidthDeg', label: 'Ancho de haz horizontal', unit: '°', min: 10, max: 360 },
  { key: 'verticalBeamwidthDeg', label: 'Ancho de haz vertical', unit: '°', min: 2, max: 90 },
  { key: 'downtiltDeg', label: 'Inclinación hacia abajo', unit: '°', min: -10, max: 30 },
];

/** Sitio LTE macro típico: 40 W por sector, 2 dB de cable, teléfono a 1,5 m. */
export const BASE_SITE: SiteParams = {
  antennaHeightM: 30,
  powerW: 40,
  cableLossDb: 2,
  ueHeightM: 1.5,
  noiseFigureDb: 7,
  uePowerW: 0.2,
  uplinkResourceBlocks: 2,
  siteNoiseFigureDb: 5,
  uplinkInterferenceDb: 3,
};
export const BASE_ANTENNA: SectorAntenna = { gainDbi: 17, horizontalBeamwidthDeg: 65, verticalBeamwidthDeg: 7, downtiltDeg: 4 };

/** Modelo con que abre cada banda: Hata solo vale hasta 2000 MHz. */
export const defaultModel = (band: Band): ModelId => (band.frequencyMHz > 2000 ? 'uma' : 'hata-urbano');

export const NEIGHBOR_FIELD: NumberFieldSpec<'neighborKm'> = {
  key: 'neighborKm',
  label: 'Distancia a los sitios vecinos',
  unit: 'km',
  min: 0,
  max: 20,
  hint: 'Para la SINR: seis sitios iguales a esta distancia, transmitiendo a plena carga. En ciudad suelen estar a 0,5–1,5 km; escribe 0 para ver solo los sectores de este sitio.',
};

/** Distancia a los vecinos con que abre la página (km). */
export const DEFAULT_NEIGHBOR_KM = 1;
/** Azimut de cada sector con que abre la página (°). */
export const DEFAULT_AZIMUTHS: readonly number[] = [0, 120, 240];
export const MAX_SECTORS = 4;
export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 40;

/** Vistas de la leyenda con umbrales editables. */
export type BandView = 'rsrp' | 'sinr' | 'up';

/**
 * Umbrales de cada vista. En subida, −5 dB por bloque es más o menos lo mínimo con que decodifica
 * la modulación más robusta (QPSK).
 */
export const CELL_THRESHOLDS: Record<BandView, ThresholdSpec> = {
  rsrp: { defaults: [-80, -90, -100, -110], min: -150, max: -20 },
  sinr: { defaults: [20, 13, 5, 0], min: -20, max: 50 },
  up: { defaults: [20, 10, 0, -5], min: -20, max: 50 },
};
