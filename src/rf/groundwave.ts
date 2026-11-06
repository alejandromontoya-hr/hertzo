// Onda de tierra en onda media (AM). Módulo puro.
//
// En AM la señal viaja pegada al suelo y lo que manda es la conductividad del terreno,
// no el relieve. El campo es E = E₀·|W|/d, donde |W| ≤ 1 es la atenuación del suelo:
//   - cerca: Tierra plana de Sommerfeld-Norton, con la función de error complementaria exacta;
//   - lejos: Tierra esférica con la serie de residuos de Wait (curvatura con k = 4/3).
// Entre 0,4 y 0,6 veces el límite de Tierra plana (80 / f^⅓ km) se pasa de una a otra
// mezclando los dos resultados en dB, para que el campo no salte.
//
// Implementación propia a partir de las fórmulas publicadas (Norton 1937, Wait 1964; las mismas
// del Manual de onda de tierra de la UIT y del informe NTIA 99-368 de DeMinco). Se validó contra
// los vectores de prueba del LFMF de NTIA (https://github.com/NTIA/LFMF-test-data): no se copió
// código del LFMF.

import { freeSpaceLossDb } from './fieldStrength';

export interface GroundType {
  id: string;
  label: string;
  /** Conductividad (S/m). */
  sigmaSm: number;
  /** Permitividad relativa. */
  epsilonR: number;
}

/**
 * Tipos de suelo de las curvas de la ITU-R P.368, con la conductividad y la permitividad de la
 * tabla 2 del Manual de onda de tierra de la ITU (2014). En suelos secos la permitividad pesa
 * tanto como la conductividad: con 0,1 mS/m, εr 3 en vez de 22 baja el campo a 30 km y 1 MHz
 * de 0,47 a 0,07 mV/m.
 */
export const GROUND_TYPES: readonly GroundType[] = [
  { id: 'mar', label: 'Agua de mar (5 S/m)', sigmaSm: 5, epsilonR: 70 },
  { id: 'dulce', label: 'Agua dulce (3 mS/m)', sigmaSm: 0.003, epsilonR: 80 },
  { id: 'muy-humeda', label: 'Tierra muy húmeda (30 mS/m)', sigmaSm: 0.03, epsilonR: 40 },
  { id: 'humeda', label: 'Tierra húmeda (10 mS/m)', sigmaSm: 0.01, epsilonR: 30 },
  { id: 'media', label: 'Tierra media (3 mS/m)', sigmaSm: 0.003, epsilonR: 22 },
  { id: 'seca', label: 'Tierra seca (1 mS/m)', sigmaSm: 0.001, epsilonR: 15 },
  { id: 'muy-seca', label: 'Tierra muy seca o roca (0,3 mS/m)', sigmaSm: 0.0003, epsilonR: 7 },
  { id: 'roca', label: 'Roca dura o ciudad densa (0,1 mS/m)', sigmaSm: 0.0001, epsilonR: 3 },
];

// --- Números complejos (lo justo para este módulo) ---

export interface Complex {
  re: number;
  im: number;
}
const cx = (re: number, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => cx(a.re + b.re, a.im + b.im);
const cSub = (a: Complex, b: Complex): Complex => cx(a.re - b.re, a.im - b.im);
const cMul = (a: Complex, b: Complex): Complex => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cScale = (s: number, a: Complex): Complex => cx(s * a.re, s * a.im);
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cExp = (a: Complex): Complex => {
  const m = Math.exp(a.re);
  return cx(m * Math.cos(a.im), m * Math.sin(a.im));
};
const cSqrt = (a: Complex): Complex => {
  const r = Math.sqrt(Math.hypot(a.re, a.im));
  const t = Math.atan2(a.im, a.re) / 2;
  return cx(r * Math.cos(t), r * Math.sin(t));
};
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

/**
 * Función de Faddeeva w(z) = e^(−z²)·erfc(−i·z). Cerca del origen, con la serie de Taylor de
 * erf; lejos, con la fracción continua de Laplace en el semiplano superior y la reflexión
 * w(z) = 2·e^(−z²) − w(−z) en el inferior.
 */
export function faddeeva(z: Complex): Complex {
  if (cAbs(z) < 4) {
    // erf(u) = 2/√π · Σ (−1)ⁿ u^(2n+1) / (n!·(2n+1)), con u = −i·z.
    const u = cx(z.im, -z.re);
    const u2 = cMul(u, u);
    let term = u;
    let sum = u;
    for (let n = 1; n < 200; n++) {
      term = cScale(-1 / n, cMul(term, u2));
      const add = cScale(1 / (2 * n + 1), term);
      sum = cAdd(sum, add);
      if (cAbs(add) < 1e-17 * cAbs(sum)) break;
    }
    const erf = cScale(2 / Math.sqrt(Math.PI), sum);
    return cMul(cExp(cScale(-1, cMul(z, z))), cSub(cx(1), erf));
  }
  if (z.im < 0) {
    return cSub(cScale(2, cExp(cScale(-1, cMul(z, z)))), faddeeva(cx(-z.re, -z.im)));
  }
  // w(z) = (i/√π) / (z − (1/2)/(z − 1/(z − (3/2)/(z − …)))).
  let tail = cx(0);
  for (let n = 80; n >= 1; n--) tail = cDiv(cx(n / 2), cSub(z, tail));
  return cDiv(cx(0, 1 / Math.sqrt(Math.PI)), cSub(z, tail));
}

/** Longitud de onda (m) y número de onda (rad/m). */
const wave = (frequencyMHz: number) => {
  const wavelengthM = 299.792458 / frequencyMHz;
  return { wavelengthM, k: (2 * Math.PI) / wavelengthM };
};

/**
 * Impedancia superficial normalizada para polarización vertical: Δ = √(εc − 1) / εc, con la
 * permitividad compleja εc = εr − i·60·σ·λ.
 */
function surfaceImpedance(frequencyMHz: number, ground: GroundType): Complex {
  const ec = cx(ground.epsilonR, -60 * ground.sigmaSm * wave(frequencyMHz).wavelengthM);
  return cDiv(cSqrt(cSub(ec, cx(1))), ec);
}

export interface NortonResult {
  /** Distancia numérica de Sommerfeld w (compleja); `p` es su módulo. */
  w: Complex;
  p: number;
  /** Factor de atenuación del suelo |F| (0 a 1). */
  attenuation: number;
}

/**
 * Atenuación de onda de tierra sobre Tierra plana, polarización vertical, antenas en el suelo
 * (Norton, forma exacta):
 *   w = −i·(k·d/2)·Δ²,  F = 1 − i·√(π·w)·e^(−w)·erfc(i·√w) = 1 − i·√(π·w)·W_F(−√w).
 * Para |w| grande, |F| → 1/(2·|w|): el campo cae como 1/d².
 */
export function nortonAttenuation(distanceM: number, frequencyMHz: number, ground: GroundType): NortonResult {
  const delta = surfaceImpedance(frequencyMHz, ground);
  const w = cMul(cx(0, (-wave(frequencyMHz).k * distanceM) / 2), cMul(delta, delta));
  const root = cSqrt(w);
  const f = cSub(cx(1), cMul(cMul(cx(0, 1), cSqrt(cScale(Math.PI, w))), faddeeva(cScale(-1, root))));
  return { w, p: cAbs(w), attenuation: Math.min(1, cAbs(f)) };
}

// --- Tierra esférica: serie de residuos de Wait ---

/** Radio efectivo de la Tierra con k = 4/3 (m), el de la atmósfera estándar. */
export const EFFECTIVE_EARTH_RADIUS_M = (4 / 3) * 6370e3;

/** Primeros ceros de Ai'(t) y de Ai(t), tabulados (Abramowitz y Stegun, tabla 10.13). */
const AI_PRIME_ZEROS = [-1.018792972, -3.248197582, -4.820099211, -6.163307356, -7.372177255, -8.488486734];
const AI_ZEROS = [-2.33810741, -4.087949444, -5.520559828, -6.78670809, -7.944133587, -9.022650853];

/** Cero s de Ai' (s ≥ 1): tabla, o la serie asintótica −t^⅔·(1 − 7/(48 t²) + 35/(288 t⁴)), t = 3π(4s − 3)/8. */
function aiPrimeZero(s: number): number {
  if (s <= AI_PRIME_ZEROS.length) return AI_PRIME_ZEROS[s - 1]!;
  const t = (3 * Math.PI * (4 * s - 3)) / 8;
  return -(t ** (2 / 3)) * (1 - 7 / (48 * t * t) + 35 / (288 * t ** 4));
}

/** Cero s de Ai (s ≥ 1): tabla, o −t^⅔·(1 + 5/(48 t²) − 5/(36 t⁴)), t = 3π(4s − 1)/8. */
function aiZero(s: number): number {
  if (s <= AI_ZEROS.length) return AI_ZEROS[s - 1]!;
  const t = (3 * Math.PI * (4 * s - 1)) / 8;
  return -(t ** (2 / 3)) * (1 + 5 / (48 * t * t) - 5 / (36 * t ** 4));
}

/** Integra dt/dλ = f(λ, t) con Runge-Kutta 4 de λ = 0 a λ = end (camino recto en el plano complejo). */
function integrate(start: Complex, end: Complex, f: (l: Complex, t: Complex) => Complex, steps = 400): Complex {
  const h = cScale(1 / steps, end);
  let t = start;
  for (let i = 0; i < steps; i++) {
    const l = cScale(i / steps, end);
    const lMid = cAdd(l, cScale(0.5, h));
    const k1 = f(l, t);
    const k2 = f(lMid, cAdd(t, cMul(cScale(0.5, h), k1)));
    const k3 = f(lMid, cAdd(t, cMul(cScale(0.5, h), k2)));
    const k4 = f(cAdd(l, h), cAdd(t, cMul(h, k3)));
    t = cAdd(t, cMul(cScale(1 / 6, h), cAdd(cAdd(k1, cScale(2, k2)), cAdd(cScale(2, k3), k4))));
  }
  return t;
}

/** e^(−iπ/3): los ceros de la ecuación modal están sobre ese rayo cuando q = 0 o q = ∞. */
const ROTATION = cx(Math.cos(Math.PI / 3), -Math.sin(Math.PI / 3));

/**
 * Raíz t_s de la ecuación modal w₁'(t) − q·w₁(t) = 0. Derivando, dt/dq = 1/(t − q²): se sigue la
 * raíz desde q = 0 (ceros de Ai') si |q| ≤ 1, o desde q = ∞ (ceros de Ai) con u = 1/q,
 * dt/du = −1/(u²·t − 1).
 */
function modalRoot(s: number, q: Complex): Complex {
  if (cAbs(q) <= 1) {
    return integrate(cScale(-aiPrimeZero(s), ROTATION), q, (l, t) => cDiv(cx(1), cSub(t, cMul(l, l))));
  }
  return integrate(cScale(-aiZero(s), ROTATION), cDiv(cx(1), q), (u, t) => cDiv(cx(-1), cSub(cMul(cMul(u, u), t), cx(1))));
}

interface ResidueSetup {
  /** m = (k·a/2)^⅓. */
  m: number;
  q2: Complex;
  roots: Complex[];
}

const MAX_TERMS = 200;
const residueCache = new Map<string, ResidueSetup>();

/** Las raíces solo dependen de la frecuencia, el suelo y el radio de la Tierra: se calculan una vez. */
function residueSetup(frequencyMHz: number, ground: GroundType, earthRadiusM: number): ResidueSetup {
  const key = `${frequencyMHz}|${ground.sigmaSm}|${ground.epsilonR}|${earthRadiusM}`;
  let setup = residueCache.get(key);
  if (!setup) {
    const m = Math.cbrt((wave(frequencyMHz).k * earthRadiusM) / 2);
    // q = −i·m·Δ
    const q = cMul(cx(0, -m), surfaceImpedance(frequencyMHz, ground));
    setup = { m, q2: cMul(q, q), roots: [] };
    const roots = setup.roots;
    for (let s = 1; s <= MAX_TERMS; s++) roots.push(modalRoot(s, q));
    residueCache.set(key, setup);
  }
  return setup;
}

/**
 * Atenuación sobre Tierra esférica, antenas en el suelo (Wait):
 *   x = m·d/a,  |W| = √(π·x) · |Σ e^(−i·x·t_s) / (t_s − q²)|.
 * Converge rápido lejos; cerca necesita muchos términos (por eso se usa desde 0,4 del límite).
 */
export function residueSeriesAttenuation(
  distanceM: number,
  frequencyMHz: number,
  ground: GroundType,
  earthRadiusM = EFFECTIVE_EARTH_RADIUS_M,
): number {
  const { m, q2, roots } = residueSetup(frequencyMHz, ground, earthRadiusM);
  const x = (m * distanceM) / earthRadiusM;
  let sum = cx(0);
  for (const t of roots) {
    const term = cDiv(cExp(cMul(cx(0, -x), t)), cSub(t, q2));
    sum = cAdd(sum, term);
    // Cada término decae como e^(x·Im t); al quedar 10⁻⁹ del total, el resto no pesa.
    if (cAbs(term) < 1e-9 * cAbs(sum)) break;
  }
  return Math.sqrt(Math.PI * x) * cAbs(sum);
}

/**
 * Distancia hasta la que vale la Tierra plana (km): ~80 / f(MHz)^⅓ (Manual de onda de tierra
 * de la UIT, ec. 15). Hertzo pasa a la Tierra esférica antes, entre 0,4 y 0,6 de este valor.
 */
export function flatEarthLimitKm(frequencyMHz: number): number {
  return 80 / Math.cbrt(frequencyMHz);
}

/** Fracciones del límite de Tierra plana entre las que se pasa de Norton a la serie de residuos. */
const HANDOFF_START = 0.4;
const HANDOFF_END = 0.6;

/** Atenuación del suelo |W| en dB (≤ 0), con el paso suave de Tierra plana a esférica. */
export function groundAttenuationDb(
  distanceM: number,
  frequencyMHz: number,
  ground: GroundType,
  earthRadiusM = EFFECTIVE_EARTH_RADIUS_M,
): number {
  const limitM = flatEarthLimitKm(frequencyMHz) * 1000;
  const start = HANDOFF_START * limitM;
  const end = HANDOFF_END * limitM;
  const flat = () => 20 * Math.log10(Math.max(1e-300, nortonAttenuation(distanceM, frequencyMHz, ground).attenuation));
  const sphere = () => 20 * Math.log10(Math.max(1e-300, residueSeriesAttenuation(distanceM, frequencyMHz, ground, earthRadiusM)));
  if (distanceM <= start) return flat();
  if (distanceM >= end) return sphere();
  const weight = (distanceM - start) / (end - start);
  return (1 - weight) * flat() + weight * sphere();
}

/**
 * Pérdida básica de onda de tierra (dB): espacio libre más la atenuación del suelo.
 * Con una antena monopolo (ganancia sobre suelo incluida en su dBi) reproduce E = E₀·|W|/d.
 */
export function groundwaveLossDb(distanceM: number, frequencyMHz: number, ground: GroundType): number {
  return freeSpaceLossDb(distanceM / 1000, frequencyMHz) - groundAttenuationDb(distanceM, frequencyMHz, ground);
}

/**
 * Ganancia sobre suelo perfecto de las antenas AM habituales (dBi), sin pérdidas, con corriente
 * senoidal: D = 2·f(90°)² / ∫ f²·sen θ dθ. λ/4 → 3,282 (5,16 dBi, 313,8 mV/m con 1 kW) y
 * 0,625 λ → 6,565 (8,17 dBi, 443,8 mV/m).
 */
export const AM_ANTENNAS: readonly { id: string; label: string; gainDbi: number }[] = [
  { id: 'corto', label: 'Monopolo corto (≈300 mV/m a 1 km con 1 kW)', gainDbi: 4.77 },
  { id: 'cuarto', label: 'Monopolo de λ/4 (≈313 mV/m a 1 km con 1 kW)', gainDbi: 5.15 },
  { id: 'media', label: 'Monopolo de 0,625 λ (≈444 mV/m a 1 km con 1 kW)', gainDbi: 8.17 },
];

/**
 * Distancia (km) hasta la que el campo de onda de tierra se mantiene ≥ `targetDbuvm`, dada la
 * PIRE (dBm, con la ganancia del monopolo). El campo baja con la distancia, así que se busca
 * por bisección entre 10 m y 3000 km.
 */
export function groundwaveRangeKm(
  eirpDbm: number,
  frequencyMHz: number,
  ground: GroundType,
  targetDbuvm: number,
): number {
  const field = (km: number) =>
    eirpDbm - groundwaveLossDb(km * 1000, frequencyMHz, ground) + 20 * Math.log10(frequencyMHz) + 77.2;
  let low = 0.01;
  let high = 3000;
  if (field(low) < targetDbuvm) return 0;
  if (field(high) >= targetDbuvm) return high;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(low * high); // bisección en escala logarítmica
    if (field(mid) >= targetDbuvm) low = mid;
    else high = mid;
  }
  return low;
}
