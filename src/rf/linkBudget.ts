// Balance de enlace de un sitio, por separado para bajada (talk-out) y subida (talk-in).
// Módulo puro: sin dependencias de la interfaz.
//
// El motor de propagación entrega la pérdida básica de trayecto en dB entre antenas
// isotrópicas. Por eso las ganancias de antena se pasan a dBi antes de sumarlas.

import { DIPOLE_GAIN_DBI, dbdToDbi, lineLossDb, wattsToDbm } from './units';

/** Cadena de transmisión del sitio: transmisor → combinador → línea → antena TX. */
export interface SiteTxChain {
  frequencyMHz: number;
  transmitterPowerW: number;
  /** Pérdida del combinador de cavidades o duplexor (dB). */
  combinerLossDb: number;
  lineLengthM: number;
  lineLossDbPer100m: number;
  connectorLossDb: number;
  antennaGainDbd: number;
  antennaHeightM: number;
}

/** Cadena de recepción del sitio: antena RX → amplificador de torre → línea → multiacoplador → receptor. */
export interface SiteRxChain {
  frequencyMHz: number;
  antennaGainDbd: number;
  antennaHeightM: number;
  /** Ganancia del amplificador de torre (TTA) en dB; 0 si el sitio no tiene. */
  towerAmplifierGainDb: number;
  lineLengthM: number;
  lineLossDbPer100m: number;
  /** Pérdida del multiacoplador y conectores (dB). */
  multicouplerLossDb: number;
  receiverSensitivityDbm: number;
}

/** Radio de usuario: portátil en la cintura, a la altura de la cara, móvil, etc. */
export interface RadioProfile {
  id: string;
  name: string;
  powerW: number;
  antennaGainDbd: number;
  heightM: number;
  /** Pérdida por el cuerpo o el vehículo (dB). Aplica igual en bajada y en subida. */
  bodyLossDb: number;
  sensitivityDbm: number;
}

export type LinkDirection = 'talk-out' | 'talk-in';

/** Resumen del balance de una dirección, sin la pérdida de trayecto. */
export interface LinkBudget {
  direction: LinkDirection;
  frequencyMHz: number;
  /** Potencia del transmisor de esta dirección (dBm). */
  txPowerDbm: number;
  /** Pérdidas del lado que transmite, antes de radiar (dB). */
  txLossesDb: number;
  txAntennaGainDbi: number;
  /** Potencia radiada efectiva respecto a un dipolo (dBm). */
  erpDbm: number;
  /** Potencia isotrópica radiada equivalente (dBm) = ERP + 2,15 dB. */
  eirpDbm: number;
  rxAntennaGainDbi: number;
  /** Ganancias del lado que recibe, después de la antena (dB): amplificador de torre. */
  rxGainsDb: number;
  /** Pérdidas del lado que recibe (dB). */
  rxLossesDb: number;
  sensitivityDbm: number;
  /** Mayor pérdida de trayecto con la que la señal todavía llega a la sensibilidad (dB). */
  maxPathLossDb: number;
}

function buildBudget(parts: Omit<LinkBudget, 'erpDbm' | 'eirpDbm' | 'maxPathLossDb'>): LinkBudget {
  const eirpDbm = parts.txPowerDbm - parts.txLossesDb + parts.txAntennaGainDbi;
  const erpDbm = eirpDbm - DIPOLE_GAIN_DBI;
  const maxPathLossDb =
    eirpDbm + parts.rxAntennaGainDbi + parts.rxGainsDb - parts.rxLossesDb - parts.sensitivityDbm;
  return { ...parts, erpDbm, eirpDbm, maxPathLossDb };
}

/** Bajada (talk-out): transmisor del sitio → radio de usuario, en la frecuencia de TX. */
export function talkOutBudget(tx: SiteTxChain, radio: RadioProfile): LinkBudget {
  return buildBudget({
    direction: 'talk-out',
    frequencyMHz: tx.frequencyMHz,
    txPowerDbm: wattsToDbm(tx.transmitterPowerW),
    txLossesDb:
      tx.combinerLossDb + lineLossDb(tx.lineLengthM, tx.lineLossDbPer100m) + tx.connectorLossDb,
    txAntennaGainDbi: dbdToDbi(tx.antennaGainDbd),
    rxAntennaGainDbi: dbdToDbi(radio.antennaGainDbd),
    rxGainsDb: 0,
    rxLossesDb: radio.bodyLossDb,
    sensitivityDbm: radio.sensitivityDbm,
  });
}

/** Subida (talk-in): radio de usuario → receptor del sitio, en la frecuencia de RX. */
export function talkInBudget(rx: SiteRxChain, radio: RadioProfile): LinkBudget {
  return buildBudget({
    direction: 'talk-in',
    frequencyMHz: rx.frequencyMHz,
    txPowerDbm: wattsToDbm(radio.powerW),
    txLossesDb: radio.bodyLossDb,
    txAntennaGainDbi: dbdToDbi(radio.antennaGainDbd),
    rxAntennaGainDbi: dbdToDbi(rx.antennaGainDbd),
    // Provisional: la ganancia del amplificador de torre se suma tal cual.
    rxGainsDb: rx.towerAmplifierGainDb,
    rxLossesDb: lineLossDb(rx.lineLengthM, rx.lineLossDbPer100m) + rx.multicouplerLossDb,
    sensitivityDbm: rx.receiverSensitivityDbm,
  });
}

/** Nivel recibido (dBm) para una pérdida de trayecto dada. */
export function receivedPowerDbm(budget: LinkBudget, pathLossDb: number): number {
  return (
    budget.eirpDbm - pathLossDb + budget.rxAntennaGainDbi + budget.rxGainsDb - budget.rxLossesDb
  );
}

/** Margen sobre la sensibilidad (dB). Positivo: la señal llega; negativo: no alcanza. */
export function marginDb(budget: LinkBudget, pathLossDb: number): number {
  return receivedPowerDbm(budget, pathLossDb) - budget.sensitivityDbm;
}
