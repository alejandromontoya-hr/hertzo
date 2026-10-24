// Valores por defecto del sitio y perfiles de radio de usuario.
// Son valores típicos de ejemplo: ajústalos a los equipos y mediciones de cada sistema.

import type { RadioProfile, SiteRxChain, SiteTxChain } from '../rf/linkBudget';

/** Bajada: repetidora de 860 MHz a 100 W, línea de 7/8" (~3,9 dB/100 m a 860 MHz). */
export const DEFAULT_TX_CHAIN: SiteTxChain = {
  frequencyMHz: 860,
  transmitterPowerW: 100,
  combinerLossDb: 3,
  lineLengthM: 60,
  lineLossDbPer100m: 3.9,
  connectorLossDb: 1,
  antennaGainDbd: 6,
  antennaHeightM: 50,
};

/** Subida: 815 MHz, sin amplificador de torre. */
export const DEFAULT_RX_CHAIN: SiteRxChain = {
  frequencyMHz: 815,
  antennaGainDbd: 6,
  antennaHeightM: 50,
  towerAmplifierGainDb: 0,
  lineLengthM: 60,
  lineLossDbPer100m: 3.9,
  multicouplerLossDb: 2,
  receiverSensitivityDbm: -119,
};

export type LmrBandId = 'vhf' | 'uhf' | '700' | '800';

export interface LmrBand {
  id: LmrBandId;
  label: string;
  /** Rango típico de la banda, para mostrar al usuario. */
  range: string;
  tx: SiteTxChain;
  rx: SiteRxChain;
}

/**
 * Valores de ejemplo por banda. La línea es de 7/8": ~1,4 dB/100 m a 150 MHz, ~2,6 a 460 MHz,
 * ~3,6 a 770 MHz y ~3,9 a 860 MHz. Las frecuencias siguen la separación habitual de cada banda.
 */
export const LMR_BANDS: readonly LmrBand[] = [
  {
    id: 'vhf',
    label: 'VHF',
    range: '136–174 MHz',
    tx: { ...DEFAULT_TX_CHAIN, frequencyMHz: 152, lineLossDbPer100m: 1.4, antennaGainDbd: 3 },
    rx: { ...DEFAULT_RX_CHAIN, frequencyMHz: 157, lineLossDbPer100m: 1.4, antennaGainDbd: 3 },
  },
  {
    id: 'uhf',
    label: 'UHF',
    range: '403–470 MHz',
    tx: { ...DEFAULT_TX_CHAIN, frequencyMHz: 460, lineLossDbPer100m: 2.6 },
    rx: { ...DEFAULT_RX_CHAIN, frequencyMHz: 465, lineLossDbPer100m: 2.6 },
  },
  {
    id: '700',
    label: '700 MHz',
    range: '769–775 / 799–805 MHz',
    tx: { ...DEFAULT_TX_CHAIN, frequencyMHz: 770, lineLossDbPer100m: 3.6 },
    rx: { ...DEFAULT_RX_CHAIN, frequencyMHz: 800, lineLossDbPer100m: 3.6 },
  },
  { id: '800', label: '800 MHz', range: '851–869 / 806–824 MHz', tx: DEFAULT_TX_CHAIN, rx: DEFAULT_RX_CHAIN },
];

/** Radio del cálculo de cobertura alrededor del sitio (km). */
export const DEFAULT_RADIUS_KM = 50;

export const CUSTOM_PROFILE_ID = 'personalizado';

export const RADIO_PROFILES: readonly RadioProfile[] = [
  {
    id: 'portatil-cintura',
    name: 'Portátil en la cintura',
    powerW: 3,
    antennaGainDbd: -3,
    heightM: 1,
    bodyLossDb: 12,
    sensitivityDbm: -116,
  },
  {
    id: 'portatil-cara',
    name: 'Portátil a la altura de la cara',
    powerW: 3,
    antennaGainDbd: -3,
    heightM: 1.5,
    bodyLossDb: 6,
    sensitivityDbm: -116,
  },
  {
    id: 'movil-techo',
    name: 'Móvil con antena en el techo',
    powerW: 35,
    antennaGainDbd: 3,
    heightM: 1.5,
    bodyLossDb: 1,
    sensitivityDbm: -116,
  },
];

export const DEFAULT_RADIO_PROFILE_ID = 'portatil-cintura';
