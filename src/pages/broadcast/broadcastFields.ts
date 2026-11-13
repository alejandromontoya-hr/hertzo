// Servicios, emisoras por omisión y campos del panel de /radiodifusion, con sus rangos. Los usan
// el formulario y el enlace de "Compartir" (que no acepta un valor fuera de rango).

import type { NumberFieldSpec } from '../../ui/fields';

export type Service = 'fm' | 'am';

export interface FmStation {
  frequencyMHz: number;
  erpKw: number;
  antennaHeightM: number;
  receiverHeightM: number;
}

export interface AmStation {
  frequencyKHz: number;
  powerKw: number;
}

export const FM_FIELDS: readonly NumberFieldSpec<keyof FmStation>[] = [
  { key: 'frequencyMHz', label: 'Frecuencia', unit: 'MHz', min: 76, max: 108 },
  { key: 'erpKw', label: 'Potencia radiada (ERP)', unit: 'kW', min: 0, max: 500, minExclusive: true },
  { key: 'antennaHeightM', label: 'Altura de la antena', unit: 'm', min: 1, max: 1000 },
  {
    key: 'receiverHeightM',
    label: 'Altura del receptor',
    unit: 'm',
    min: 0.5,
    max: 100,
    hint: '10 m es la altura de referencia para planificar FM; 1,5 m para un radio portátil.',
  },
];

export const AM_FIELDS: readonly NumberFieldSpec<keyof AmStation>[] = [
  { key: 'frequencyKHz', label: 'Frecuencia', unit: 'kHz', min: 530, max: 1710 },
  { key: 'powerKw', label: 'Potencia del transmisor', unit: 'kW', min: 0, max: 1000, minExclusive: true },
];

/**
 * Umbrales de campo de la ITU-R BS.412 (FM) y, en AM, los contornos del plan técnico de
 * radiodifusión sonora en AM de Colombia (Decreto 1445 de 1995, numeral 4.21): 1250, 625, 500 y
 * 250 µV/m = 20·log(µV/m) = 61,9, 55,9, 54,0 y 48,0 dBµV/m, redondeados a 62, 56, 54 y 48.
 */
export const SERVICE = {
  fm: {
    thresholds: [74, 66, 54, 48],
    descriptions: ['estéreo, ciudades grandes', 'estéreo, urbano', 'estéreo, rural', 'mono, rural'],
    radiusKm: 60,
  },
  am: {
    thresholds: [62, 56, 54, 48],
    descriptions: [
      'contorno de 1250 µV/m (Decreto 1445 de 1995)',
      'contorno de 625 µV/m (Decreto 1445 de 1995)',
      'contorno de 500 µV/m (Decreto 1445 de 1995)',
      'contorno de 250 µV/m (Decreto 1445 de 1995)',
    ],
    radiusKm: 150,
  },
} as const;

/** FM: radio máximo del cálculo con ITM (más allá es lento y el horizonte ya cortó). */
export const FM_MAX_RADIUS_KM = 150;

/** Emisoras con que abre la página. */
export const DEFAULT_FM: FmStation = { frequencyMHz: 98.5, erpKw: 10, antennaHeightM: 40, receiverHeightM: 10 };
export const DEFAULT_AM: AmStation = { frequencyKHz: 1000, powerKw: 10 };
/** Antena AM (índice en AM_ANTENNAS) y suelo con que abre la página. */
export const DEFAULT_AM_ANTENNA_INDEX = 1;
export const DEFAULT_GROUND_ID = 'media';
export const MAX_RADIUS_KM = 300;
/** Rango de los umbrales de la leyenda (dBµV/m). */
export const THRESHOLD_RANGE = { min: 0, max: 140 };
