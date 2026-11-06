// Atenuación por lluvia en enlaces de microondas. Módulo puro.
//
// - ITU-R P.838-3: atenuación específica γR = k·R^α (dB/km), con k y α según la frecuencia y la
//   polarización (regresión oficial de la Recomendación, ecuaciones 2 y 3, tablas 1 a 4).
// - ITU-R P.530-18, §2.4.1: atenuación del trayecto excedida el 0,01 % del tiempo,
//   A0,01 = γR·d·r, y su extrapolación a otros porcentajes para latitudes menores de 30°.

export type Polarization = 'vertical' | 'horizontal';

interface Regression {
  a: readonly number[];
  b: readonly number[];
  c: readonly number[];
  m: number;
  /** Término constante (ck o cα de la Recomendación). */
  k: number;
}

// Coeficientes de la ITU-R P.838-3, tablas 1 (kH), 2 (kV), 3 (αH) y 4 (αV).
const K_H: Regression = {
  a: [-5.3398, -0.35351, -0.23789, -0.94158],
  b: [-0.10008, 1.2697, 0.86036, 0.64552],
  c: [1.13098, 0.454, 0.15354, 0.16817],
  m: -0.18961,
  k: 0.71147,
};
const K_V: Regression = {
  a: [-3.80595, -3.44965, -0.39902, 0.50167],
  b: [0.56934, -0.22911, 0.73042, 1.07319],
  c: [0.81061, 0.51059, 0.11899, 0.27195],
  m: -0.16398,
  k: 0.63297,
};
const ALPHA_H: Regression = {
  a: [-0.14318, 0.29591, 0.32177, -5.3761, 16.1721],
  b: [1.82442, 0.77564, 0.63773, -0.9623, -3.2998],
  c: [-0.55187, 0.19822, 0.13164, 1.47828, 3.4399],
  m: 0.67849,
  k: -1.95537,
};
const ALPHA_V: Regression = {
  a: [-0.07771, 0.56727, -0.20238, -48.2991, 48.5833],
  b: [2.3384, 0.95545, 1.1452, 0.791669, 0.791459],
  c: [-0.76284, 0.54039, 0.26809, 0.116226, 0.116479],
  m: -0.053739,
  k: 0.83433,
};

/** Σ aj·exp(−((log f − bj)/cj)²) + m·log f + c, con f en GHz. */
function regression(fGHz: number, r: Regression): number {
  const lf = Math.log10(fGHz);
  let sum = r.m * lf + r.k;
  for (let j = 0; j < r.a.length; j++) sum += r.a[j]! * Math.exp(-(((lf - r.b[j]!) / r.c[j]!) ** 2));
  return sum;
}

/** Coeficientes k y α de la ITU-R P.838-3 (frecuencia en MHz, válida de 1 a 1000 GHz). */
export function rainCoefficients(frequencyMHz: number, polarization: Polarization): { k: number; alpha: number } {
  const f = frequencyMHz / 1000;
  const vertical = polarization === 'vertical';
  return {
    k: 10 ** regression(f, vertical ? K_V : K_H),
    alpha: regression(f, vertical ? ALPHA_V : ALPHA_H),
  };
}

/** Atenuación específica por lluvia γR = k·R^α (dB/km), con R la intensidad de lluvia (mm/h). */
export function rainSpecificAttenuationDbPerKm(frequencyMHz: number, rainRateMmH: number, polarization: Polarization): number {
  const { k, alpha } = rainCoefficients(frequencyMHz, polarization);
  return k * rainRateMmH ** alpha;
}

/**
 * Factor de distancia efectiva de la ITU-R P.530-18 (la lluvia fuerte no cubre todo el trayecto):
 *   r = 1 / (0,477·d^0,633·R^(0,073·α)·f^0,123 − 10,579·(1 − e^(−0,024·d))), como máximo 2,5.
 */
export function rainPathFactor(frequencyMHz: number, distanceKm: number, rainRateMmH: number, polarization: Polarization): number {
  const { alpha } = rainCoefficients(frequencyMHz, polarization);
  const f = frequencyMHz / 1000;
  const denominator =
    0.477 * distanceKm ** 0.633 * rainRateMmH ** (0.073 * alpha) * f ** 0.123 - 10.579 * (1 - Math.exp(-0.024 * distanceKm));
  return denominator <= 0 ? 2.5 : Math.min(2.5, 1 / denominator);
}

/** Atenuación por lluvia excedida el 0,01 % del año (dB): A0,01 = γR·d·r, con R = R0,01. */
export function rainAttenuation001Db(frequencyMHz: number, distanceKm: number, rain001MmH: number, polarization: Polarization): number {
  return (
    rainSpecificAttenuationDbPerKm(frequencyMHz, rain001MmH, polarization) *
    distanceKm *
    rainPathFactor(frequencyMHz, distanceKm, rain001MmH, polarization)
  );
}

/** Coeficientes de la ITU-R P.530-18 (§2.4.1, ecuaciones 35 y 36) para pasar de A0,01 a otro p %. */
export function rainTimeCoefficients(frequencyMHz: number): { c1: number; c2: number; c3: number } {
  const f = frequencyMHz / 1000;
  const c0 = f >= 10 ? 0.12 + 0.4 * Math.log10((f / 10) ** 0.8) : 0.12;
  return {
    c1: 0.07 ** c0 * 0.12 ** (1 - c0),
    c2: 0.855 * c0 + 0.546 * (1 - c0),
    c3: 0.139 * c0 + 0.043 * (1 - c0),
  };
}

/**
 * Atenuación excedida el p % del año (0,001 ≤ p ≤ 1), ITU-R P.530-18 (§2.4.1, ecuación 34),
 * válida en todo el mundo: Ap = A0,01 · C1 · p^−(C2 + C3·log p), con C0 que depende de la frecuencia.
 */
export function rainAttenuationDb(a001Db: number, percent: number, frequencyMHz: number): number {
  const { c1, c2, c3 } = rainTimeCoefficients(frequencyMHz);
  return a001Db * c1 * percent ** -(c2 + c3 * Math.log10(percent));
}

export interface RainOutage {
  /** Porcentaje del año en que la lluvia supera el margen. */
  percent: number;
  /**
   * 'below': el margen supera lo que da la fórmula al 0,001 %, así que el corte es menor que
   * eso (se informa 0,001 %); 'above': la lluvia supera el margen más del 1 % del año (se informa 1 %).
   */
  bound: 'below' | 'above' | null;
}

/** Fuera de 0,001–1 % la extrapolación de la P.530 no vale. */
const MIN_PERCENT = 0.001;
const MAX_PERCENT = 1;

/**
 * Porcentaje del año en que la lluvia se come un margen dado: se despeja p de Ap = margen.
 * Con L = log p: C3·L² + C2·L + log(margen / (C1·A0,01)) = 0.
 */
export function rainOutagePercent(a001Db: number, fadeMarginDb: number, frequencyMHz: number): RainOutage {
  if (fadeMarginDb <= 0 || a001Db <= 0) return fadeMarginDb <= 0 ? { percent: 100, bound: 'above' } : { percent: 0, bound: 'below' };
  if (fadeMarginDb <= rainAttenuationDb(a001Db, MAX_PERCENT, frequencyMHz)) return { percent: MAX_PERCENT, bound: 'above' };
  if (fadeMarginDb >= rainAttenuationDb(a001Db, MIN_PERCENT, frequencyMHz)) return { percent: MIN_PERCENT, bound: 'below' };
  const { c1, c2, c3 } = rainTimeCoefficients(frequencyMHz);
  const y = Math.log10(fadeMarginDb / (c1 * a001Db));
  const L = (-c2 + Math.sqrt(c2 ** 2 - 4 * c3 * y)) / (2 * c3);
  return { percent: 10 ** L, bound: null };
}

/**
 * Intensidad de lluvia R0,01 por omisión: 95 mm/h, la de la zona N de la ITU-R P.837-1, que cubre
 * los Andes colombianos. Para un sitio concreto conviene el valor del mapa digital de la P.837-7.
 */
export const DEFAULT_RAIN_RATE_MM_H = 95;
