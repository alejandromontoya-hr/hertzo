// Pérdida en espacio libre e intensidad de campo. Módulo puro.

import { DIPOLE_GAIN_DBI, wattsToDbm } from './units';

/** Pérdida básica en espacio libre (dB) entre antenas isotrópicas: 32,45 + 20·log f(MHz) + 20·log d(km). */
export function freeSpaceLossDb(distanceKm: number, frequencyMHz: number): number {
  return 32.45 + 20 * Math.log10(frequencyMHz) + 20 * Math.log10(distanceKm);
}

/**
 * Intensidad de campo (dBµV/m) que produce una potencia recibida en una antena isotrópica
 * (ITU-R P.525): E = P(dBm) + 20·log f(MHz) + 77,2.
 */
export function fieldStrengthDbuvm(isotropicReceivedDbm: number, frequencyMHz: number): number {
  return isotropicReceivedDbm + 20 * Math.log10(frequencyMHz) + 77.2;
}

/** Potencia en kW → dBm. 1 kW = 60 dBm. */
export function kilowattsToDbm(kilowatts: number): number {
  return wattsToDbm(kilowatts * 1000);
}

/** ERP (respecto a un dipolo) → PIRE (respecto a una antena isotrópica): + 2,15 dB. */
export function erpToEirpDbm(erpDbm: number): number {
  return erpDbm + DIPOLE_GAIN_DBI;
}

/** dBµV/m → mV/m. 60 dBµV/m = 1 mV/m. */
export function dbuvmToMvm(dbuvm: number): number {
  return 10 ** (dbuvm / 20) / 1000;
}

/** Campo (dBµV/m) a partir de la PIRE (dBm) y la pérdida básica del trayecto (dB). */
export function fieldFromEirp(eirpDbm: number, basicLossDb: number, frequencyMHz: number): number {
  return fieldStrengthDbuvm(eirpDbm - basicLossDb, frequencyMHz);
}
