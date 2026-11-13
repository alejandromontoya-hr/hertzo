// Tipos de enlace, valores por omisión y campos del panel de /enlace, con sus rangos. Los usan el
// formulario y el enlace de "Compartir" (que no acepta un valor fuera de rango).

import type { LonLat } from '../../geo/geodesy';
import type { Polarization } from '../../rf/rain';
import type { NumberFieldSpec } from '../../ui/fields';

export type LinkType = 'microondas' | 'radio';

export interface LinkParams {
  frequencyMHz: number;
  txPowerDbm: number;
  heightAM: number;
  heightBM: number;
  /** Microondas: diámetro de cada parábola (m). Radio: ganancia de cada antena (dBi). */
  antennaA: number;
  antennaB: number;
  lossAdb: number;
  lossBdb: number;
  thresholdDbm: number;
}

export const PRESETS: Record<LinkType, { params: LinkParams; frequencies: { id: string; label: string }[] }> = {
  microondas: {
    params: { frequencyMHz: 11000, txPowerDbm: 20, heightAM: 30, heightBM: 30, antennaA: 0.6, antennaB: 0.6, lossAdb: 1, lossBdb: 1, thresholdDbm: -70 },
    frequencies: [6175, 7400, 8000, 11000, 13000, 15000, 18000, 23000].map((f) => ({ id: String(f), label: `${f / 1000} GHz` })),
  },
  radio: {
    params: { frequencyMHz: 450, txPowerDbm: 40, heightAM: 20, heightBM: 20, antennaA: 10, antennaB: 10, lossAdb: 2, lossBdb: 2, thresholdDbm: -110 },
    frequencies: [150, 450, 900].map((f) => ({ id: String(f), label: `${f} MHz` })),
  },
};

export const K_FACTORS = [
  { id: '1.3333', label: 'k = 4/3 (atmósfera estándar)' },
  { id: '1', label: 'k = 1 (sin refracción)' },
  { id: '0.6667', label: 'k = 2/3 (desfavorable, para el peor caso)' },
];

export type LossModel = 'difraccion' | 'itm';

export const POLARIZATIONS: { id: Polarization; label: string }[] = [
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal (la lluvia atenúa más)' },
];

/** Ejemplo inicial: del cerro del Padre Amaya al cerro El Volador (Medellín). */
export const EXAMPLE_A: LonLat = { lon: -75.6853, lat: 6.2794 };
export const EXAMPLE_B: LonLat = { lon: -75.5828, lat: 6.2664 };

/** Nombres de los extremos del ejemplo. */
export const EXAMPLE_NAME_A = 'Cerro El Padre Amaya';
export const EXAMPLE_NAME_B = 'Cerro El Volador';

/** Pérdida para el balance con que abre cada tipo: ITM en radio, difracción en microondas. */
export const defaultLossModel = (type: LinkType): LossModel => (type === 'radio' ? 'itm' : 'difraccion');

/** Campos de "Equipos y antenas": en microondas la antena es el diámetro de la parábola; en radio, su ganancia. */
export function linkFieldSpecs(type: LinkType): NumberFieldSpec<keyof LinkParams>[] {
  const antennaSpec = (key: 'antennaA' | 'antennaB', end: string): NumberFieldSpec<keyof LinkParams> =>
    type === 'microondas'
      ? { key, label: `Diámetro de la parábola en ${end}`, unit: 'm', min: 0.1, max: 5 }
      : { key, label: `Ganancia de la antena en ${end}`, unit: 'dBi', min: -5, max: 30 };
  return [
    { key: 'txPowerDbm', label: 'Potencia del transmisor', unit: 'dBm', min: -10, max: 60 },
    { key: 'heightAM', label: 'Altura de la antena en A', unit: 'm', min: 1, max: 300 },
    { key: 'heightBM', label: 'Altura de la antena en B', unit: 'm', min: 1, max: 300 },
    antennaSpec('antennaA', 'A'),
    antennaSpec('antennaB', 'B'),
    { key: 'lossAdb', label: 'Pérdidas de línea y conectores en A', unit: 'dB', min: 0, max: 20 },
    { key: 'lossBdb', label: 'Pérdidas de línea y conectores en B', unit: 'dB', min: 0, max: 20 },
    { key: 'thresholdDbm', label: 'Umbral del receptor', unit: 'dBm', min: -140, max: -20 },
  ];
}

export const RAIN_FIELD: NumberFieldSpec<'rainRate'> = {
  key: 'rainRate',
  label: 'Lluvia excedida el 0,01 % del año (R0,01)',
  unit: 'mm/h',
  min: 1,
  max: 250,
  hint: '95 mm/h es el valor de la zona N de la ITU-R P.837-1, la de los Andes colombianos. Para tu sitio, escribe el R0,01 del mapa de la ITU-R P.837-7.',
};

/** Factor k con que abre la página: 4/3, la atmósfera estándar. */
export const DEFAULT_K_FACTOR = 4 / 3;
/** Id del menú para un factor k: 4/3 → "1.3333". */
export const kFactorId = (k: number) => String(Number(k.toFixed(4)));

/** Terreno promedio y, como Colombia es en buena parte cálida y húmeda, la clase de clima más exigente. */
export const DEFAULT_TERRAIN_ID = 'promedio';
export const DEFAULT_CLIMATE_ID = 'humedo';
export const DEFAULT_POLARIZATION: Polarization = 'vertical';
