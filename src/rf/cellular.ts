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

/** Alturas del teléfono con las que se ajustó Hata (m). */
export const HATA_MOBILE_HEIGHT_RANGE_M = [1, 10] as const;

/** Si los datos están dentro del rango en que se ajustó Hata (teléfono de 1 a 10 m). */
export function hataInRange(frequencyMHz: number, baseHeightM: number, distanceKm: number, mobileHeightM = 1.5): boolean {
  const [minHm, maxHm] = HATA_MOBILE_HEIGHT_RANGE_M;
  return (
    frequencyMHz >= 150 && frequencyMHz <= 2000 && baseHeightM >= 30 && baseHeightM <= 200 &&
    distanceKm >= 1 && distanceKm <= 20 && mobileHeightM >= minHm && mobileHeightM <= maxHm
  );
}

const SPEED_OF_LIGHT = 299792458;

/**
 * 3GPP TR 38.901, macrocelda urbana (UMa), sin línea de vista: PL = máx(PL_LOS, PL'_NLOS).
 * Altura efectiva del entorno hE = 1 m. Validez: 10 m a 5 km, 0,5 a 100 GHz.
 */
export function umaNlosLossDb(frequencyMHz: number, baseHeightM: number, rawMobileHeightM: number, distance2dM: number): number {
  // El modelo vale con el teléfono de 1,5 a 22,5 m; por debajo de 1 m el punto de quiebre sale negativo.
  const mobileHeightM = Math.max(1.5, rawMobileHeightM);
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
  // Los cuatro bloques de 3,5 GHz que subastó Colombia en 2023 son de 80 MHz.
  { id: 'nr80', label: 'NR 80 MHz (30 kHz)', subcarrierKHz: 30, resourceBlocks: 217 },
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

/** SINR (dB) del sector servidor frente a los interferentes (otros sectores y sitios vecinos), todos a plena carga. */
export function sinrDb(servingDbm: number, interferersDbm: readonly number[], noiseDbm: number): number {
  let interferenceMw = 10 ** (noiseDbm / 10);
  for (const i of interferersDbm) interferenceMw += 10 ** (i / 10);
  return servingDbm - 10 * Math.log10(interferenceMw);
}

// --- Teléfono dentro de un edificio (3GPP TR 38.901, §7.4.3.1) ---

export type PhoneLocation = 'exterior' | 'interior-bajas' | 'interior-altas';

export const PHONE_LOCATIONS: readonly { id: PhoneLocation; label: string }[] = [
  { id: 'exterior', label: 'En la calle' },
  { id: 'interior-bajas', label: 'Dentro de un edificio (vidrio común y concreto)' },
  { id: 'interior-altas', label: 'Dentro de un edificio (vidrio reflectivo y concreto)' },
];

/**
 * Pérdida mediana (dB) de entrar a un edificio, 38.901 modelo O2I: la del muro exterior más
 * 0,5 dB/m de recorrido adentro, con el recorrido promedio de UMa (el menor de dos uniformes de
 * 0 a 25 m: 8,33 m, 4,17 dB). Bajas pérdidas: 30 % vidrio común (2 + 0,2f) y 70 % concreto
 * (5 + 4f); altas: 70 % vidrio reflectivo (23 + 0,3f) y 30 % concreto (f en GHz).
 * A 880 MHz, bajas: 10,53 + 4,17 = 14,69 dB.
 */
export function buildingEntryLossDb(frequencyMHz: number, location: PhoneLocation): number {
  if (location === 'exterior') return 0;
  const f = frequencyMHz / 1000;
  const glass = 2 + 0.2 * f;
  const concrete = 5 + 4 * f;
  const irrGlass = 23 + 0.3 * f;
  const mix = (a: number, la: number, b: number, lb: number) => -10 * Math.log10(a * 10 ** (-la / 10) + b * 10 ** (-lb / 10));
  const wall = location === 'interior-bajas' ? 5 + mix(0.3, glass, 0.7, concrete) : 5 + mix(0.7, irrGlass, 0.3, concrete);
  const indoorM = 25 / 3;
  return wall + 0.5 * indoorM;
}

// --- Sitios vecinos (interferencia de otras celdas) ---

/** Posición (m, este y norte) de los seis sitios vecinos de un anillo hexagonal a `spacingM`. */
export function neighborOffsetsM(spacingM: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (k * 60 * Math.PI) / 180;
    return { x: spacingM * Math.sin(a), y: spacingM * Math.cos(a) };
  });
}

/**
 * Pérdida típica por distancia sacada del cálculo del propio sitio: la mediana de cada anillo
 * de `binM` metros. Sirve para estimar la señal de los vecinos (que comparten configuración)
 * sin volver a correr el motor; más allá del último anillo sigue la pendiente de la mitad
 * exterior (dB por década).
 */
export function lossCurve(distancesM: ArrayLike<number>, lossesDb: ArrayLike<number>, binM = 100): (distanceM: number) => number {
  const bins = new Map<number, number[]>();
  for (let i = 0; i < distancesM.length; i++) {
    const loss = lossesDb[i]!;
    if (!Number.isFinite(loss)) continue;
    const b = Math.floor(distancesM[i]! / binM);
    let list = bins.get(b);
    if (!list) bins.set(b, (list = []));
    list.push(loss);
  }
  const points = [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, list]) => {
      list.sort((x, y) => x - y);
      return { d: (b + 0.5) * binM, loss: list[Math.floor(list.length / 2)]! };
    });
  if (points.length === 0) return () => Number.NaN;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const half = points[Math.floor(points.length / 2)]!;
  const slope = last.d > half.d ? (last.loss - half.loss) / Math.log10(last.d / half.d) : 35;
  return (d) => {
    if (d <= first.d) return first.loss;
    if (d >= last.d) return last.loss + slope * Math.log10(d / last.d);
    let i = 1;
    while (points[i]!.d < d) i++;
    const a = points[i - 1]!;
    const b = points[i]!;
    return a.loss + ((b.loss - a.loss) * (d - a.d)) / (b.d - a.d);
  };
}

/** Margen (dB) para una confiabilidad con desvanecimiento lognormal de desviación `sigmaDb`: z·σ. */
export function locationMarginDb(reliabilityPct: number, sigmaDb: number): number {
  const z: Record<number, number> = { 50: 0, 90: 1.2816, 95: 1.6449 };
  return (z[reliabilityPct] ?? 0) * sigmaDb;
}
