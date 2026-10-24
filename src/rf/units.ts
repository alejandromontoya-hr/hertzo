// Conversiones de unidades de RF. Módulo puro: sin dependencias de la interfaz.

/** Ganancia de un dipolo de media onda respecto al radiador isotrópico: 0 dBd = 2,15 dBi. */
export const DIPOLE_GAIN_DBI = 2.15;

/** Potencia en W → dBm. 100 W = 50 dBm; 3 W ≈ 34,77 dBm. */
export function wattsToDbm(watts: number): number {
  if (!(watts > 0)) throw new RangeError(`La potencia debe ser mayor que 0 W (se recibió ${watts} W).`);
  return 10 * Math.log10(watts * 1000);
}

/** Potencia en dBm → W. 50 dBm = 100 W. */
export function dbmToWatts(dbm: number): number {
  return 10 ** (dbm / 10) / 1000;
}

/** Ganancia de antena en dBd → dBi. 6 dBd = 8,15 dBi. */
export function dbdToDbi(dbd: number): number {
  return dbd + DIPOLE_GAIN_DBI;
}

/** Ganancia de antena en dBi → dBd. 8,15 dBi = 6 dBd. */
export function dbiToDbd(dbi: number): number {
  return dbi - DIPOLE_GAIN_DBI;
}

/** Pérdida de una línea de transmisión en dB. 60 m a 4 dB/100 m = 2,4 dB. */
export function lineLossDb(lengthM: number, lossDbPer100m: number): number {
  return (lengthM * lossDbPer100m) / 100;
}
