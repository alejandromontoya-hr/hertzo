// Modelos empíricos de propagación celular y presupuesto de LTE / NR. Módulo puro.

export type HataEnvironment = 'urbano-grande' | 'urbano' | 'suburbano' | 'rural';

export const HATA_ENVIRONMENTS: readonly { id: HataEnvironment; label: string }[] = [
  { id: 'urbano-grande', label: 'Urbano, ciudad grande' },
  { id: 'urbano', label: 'Urbano, ciudad mediana' },
  { id: 'suburbano', label: 'Suburbano' },
  { id: 'rural', label: 'Rural, campo abierto' },
];

/** Corrección por altura del móvil a(hm) en dB. */
function mobileHeightCorrection(frequencyMHz: number, mobileHeightM: number, environment: HataEnvironment): number {
  const logF = Math.log10(frequencyMHz);
  if (environment === 'urbano-grande') {
    return frequencyMHz <= 300
      ? 8.29 * Math.log10(1.54 * mobileHeightM) ** 2 - 1.1
      : 3.2 * Math.log10(11.75 * mobileHeightM) ** 2 - 4.97;
  }
  return (1.1 * logF - 0.7) * mobileHeightM - (1.56 * logF - 0.8);
}

/**
 * Okumura-Hata (150–1500 MHz) y COST-231 Hata (1500–2000 MHz), en dB.
 * Validez: estación base de 30 a 200 m, móvil de 1 a 10 m, distancia de 1 a 20 km.
 */
export function hataLossDb(
  frequencyMHz: number,
  baseHeightM: number,
  mobileHeightM: number,
  distanceKm: number,
  environment: HataEnvironment,
): number {
  const logF = Math.log10(frequencyMHz);
  const logHb = Math.log10(baseHeightM);
  const aHm = mobileHeightCorrection(frequencyMHz, mobileHeightM, environment);
  const slope = (44.9 - 6.55 * logHb) * Math.log10(distanceKm);
  const urban =
    frequencyMHz <= 1500
      ? 69.55 + 26.16 * logF - 13.82 * logHb - aHm + slope
      : 46.3 + 33.9 * logF - 13.82 * logHb - aHm + slope + (environment === 'urbano-grande' ? 3 : 0);
  switch (environment) {
    case 'urbano-grande':
    case 'urbano':
      return urban;
    case 'suburbano':
      return urban - 2 * Math.log10(frequencyMHz / 28) ** 2 - 5.4;
    case 'rural':
      return urban - 4.78 * logF ** 2 + 18.33 * logF - 40.94;
  }
}

/** Si los datos están dentro del rango en que se ajustó Hata. */
export function hataInRange(frequencyMHz: number, baseHeightM: number, distanceKm: number): boolean {
  return frequencyMHz >= 150 && frequencyMHz <= 2000 && baseHeightM >= 30 && baseHeightM <= 200 && distanceKm >= 1 && distanceKm <= 20;
}

const SPEED_OF_LIGHT = 299792458;

/**
 * 3GPP TR 38.901, macrocelda urbana (UMa), sin línea de vista: PL = máx(PL_LOS, PL'_NLOS).
 * Altura efectiva del entorno hE = 1 m. Validez: 10 m a 5 km, 0,5 a 100 GHz.
 */
export function umaNlosLossDb(frequencyMHz: number, baseHeightM: number, mobileHeightM: number, distance2dM: number): number {
  const fcGHz = frequencyMHz / 1000;
  const d3d = Math.hypot(distance2dM, baseHeightM - mobileHeightM);
  const breakpoint = (4 * (baseHeightM - 1) * (mobileHeightM - 1) * frequencyMHz * 1e6) / SPEED_OF_LIGHT;
  const los =
    distance2dM <= breakpoint
      ? 28 + 22 * Math.log10(d3d) + 20 * Math.log10(fcGHz)
      : 28 +
        40 * Math.log10(d3d) +
        20 * Math.log10(fcGHz) -
        9 * Math.log10(breakpoint ** 2 + (baseHeightM - mobileHeightM) ** 2);
  const nlos = 13.54 + 39.08 * Math.log10(d3d) + 20 * Math.log10(fcGHz) - 0.6 * (mobileHeightM - 1.5);
  return Math.max(los, nlos);
}

// --- Antena sectorial (3GPP TR 36.814 / 38.901) ---

export interface SectorAntenna {
  /** Ganancia máxima (dBi). */
  gainDbi: number;
  /** Ancho de haz horizontal a −3 dB (grados). */
  horizontalBeamwidthDeg: number;
  /** Ancho de haz vertical a −3 dB (grados). */
  verticalBeamwidthDeg: number;
  /** Inclinación hacia abajo (grados). */
  downtiltDeg: number;
}

/** Atenuación máxima delante/atrás y de lóbulos verticales (dB). */
const FRONT_TO_BACK_DB = 25;
const VERTICAL_SIDELOBE_DB = 20;

/** Diferencia angular en grados entre −180 y 180. */
export function angleDiffDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Ganancia (dBi) de la antena en una dirección: horizontal −mín(12(φ/φ₃dB)², 25) y vertical
 * −mín(12((θ−tilt)/θ₃dB)², 20), combinadas con tope de 25 dB.
 * φ: ángulo respecto al azimut de la antena; θ: ángulo por debajo del horizonte.
 */
export function sectorGainDbi(antenna: SectorAntenna, offAxisDeg: number, belowHorizonDeg: number): number {
  const h = -Math.min(12 * (offAxisDeg / antenna.horizontalBeamwidthDeg) ** 2, FRONT_TO_BACK_DB);
  const v = -Math.min(
    12 * ((belowHorizonDeg - antenna.downtiltDeg) / antenna.verticalBeamwidthDeg) ** 2,
    VERTICAL_SIDELOBE_DB,
  );
  return antenna.gainDbi - Math.min(-(h + v), FRONT_TO_BACK_DB);
}

// --- LTE / NR ---

export interface CarrierConfig {
  id: string;
  label: string;
  /** Separación entre subportadoras (kHz). */
  subcarrierKHz: number;
  resourceBlocks: number;
}

/** Anchos de banda habituales y sus bloques de recursos (3GPP TS 36.101 y 38.101). */
export const CARRIERS: readonly CarrierConfig[] = [
  { id: 'lte5', label: 'LTE 5 MHz', subcarrierKHz: 15, resourceBlocks: 25 },
  { id: 'lte10', label: 'LTE 10 MHz', subcarrierKHz: 15, resourceBlocks: 50 },
  { id: 'lte15', label: 'LTE 15 MHz', subcarrierKHz: 15, resourceBlocks: 75 },
  { id: 'lte20', label: 'LTE 20 MHz', subcarrierKHz: 15, resourceBlocks: 100 },
  { id: 'nr40', label: 'NR 40 MHz (30 kHz)', subcarrierKHz: 30, resourceBlocks: 106 },
  { id: 'nr100', label: 'NR 100 MHz (30 kHz)', subcarrierKHz: 30, resourceBlocks: 273 },
];

/** Potencia por elemento de recurso (dBm): la total repartida en 12 subportadoras por bloque. */
export function powerPerResourceElementDbm(totalPowerDbm: number, resourceBlocks: number): number {
  return totalPowerDbm - 10 * Math.log10(12 * resourceBlocks);
}

/** Ruido térmico por elemento de recurso (dBm): −174 + 10·log(Δf) + figura de ruido. */
export function noisePerResourceElementDbm(subcarrierKHz: number, noiseFigureDb: number): number {
  return -174 + 10 * Math.log10(subcarrierKHz * 1000) + noiseFigureDb;
}

/** SINR (dB) del sector servidor frente a los demás, con todos transmitiendo (carga 100 %). */
export function sinrDb(servingDbm: number, interferersDbm: readonly number[], noiseDbm: number): number {
  let interferenceMw = 10 ** (noiseDbm / 10);
  for (const i of interferersDbm) interferenceMw += 10 ** (i / 10);
  return servingDbm - 10 * Math.log10(interferenceMw);
}
