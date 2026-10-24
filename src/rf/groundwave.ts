// Onda de tierra en onda media (AM): Sommerfeld-Norton sobre Tierra plana, con la
// aproximación de Terman para el factor de atenuación. Módulo puro.
//
// En AM la señal viaja pegada al suelo y lo que manda es la conductividad del terreno,
// no el relieve. El campo es E = E₀·A/d, donde A ≤ 1 es la atenuación del suelo.

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

export interface NortonResult {
  /** Distancia numérica de Sommerfeld (adimensional). */
  p: number;
  /** Ángulo de fase del suelo b (rad), polarización vertical. */
  b: number;
  /** Factor de atenuación del suelo (0 a 1). */
  attenuation: number;
}

/**
 * Factor de atenuación de onda de tierra, polarización vertical (Terman):
 *   x = 1,8·10⁴·σ / f(MHz),  b = arctan((εr + 1) / x),  p = π·d / (λ·x) · cos b,
 *   A ≈ (2 + 0,3p) / (2 + p + 0,6p²) − √(p/2)·e^(−5p/8)·sen b.
 */
export function nortonAttenuation(distanceM: number, frequencyMHz: number, ground: GroundType): NortonResult {
  const wavelengthM = 299.792458 / frequencyMHz;
  const x = (1.8e4 * ground.sigmaSm) / frequencyMHz;
  const b = Math.atan((ground.epsilonR + 1) / x);
  const p = ((Math.PI * distanceM) / (wavelengthM * x)) * Math.cos(b);
  const a = (2 + 0.3 * p) / (2 + p + 0.6 * p * p) - Math.sqrt(p / 2) * Math.exp((-5 * p) / 8) * Math.sin(b);
  // La aproximación puede dar valores muy pequeños o negativos lejos; se acota.
  return { p, b, attenuation: Math.min(1, Math.max(1e-6, a)) };
}

/**
 * Pérdida básica de onda de tierra (dB): espacio libre más la atenuación del suelo.
 * Con una antena monopolo (ganancia sobre suelo incluida en su dBi) reproduce E = E₀·A/d.
 */
export function groundwaveLossDb(distanceM: number, frequencyMHz: number, ground: GroundType): number {
  const { attenuation } = nortonAttenuation(distanceM, frequencyMHz, ground);
  return freeSpaceLossDb(distanceM / 1000, frequencyMHz) - 20 * Math.log10(attenuation);
}

/**
 * Distancia hasta la que vale la Tierra plana (km): ~80 / f(MHz)^⅓. Más allá la curvatura
 * agrega atenuación y esta predicción queda optimista.
 */
export function flatEarthLimitKm(frequencyMHz: number): number {
  return 80 / Math.cbrt(frequencyMHz);
}

/** Ganancia sobre suelo perfecto de las antenas AM habituales (dBi). */
export const AM_ANTENNAS: readonly { id: string; label: string; gainDbi: number }[] = [
  { id: 'corto', label: 'Monopolo corto (≈300 mV/m a 1 km con 1 kW)', gainDbi: 4.77 },
  { id: 'cuarto', label: 'Monopolo de λ/4 (≈313 mV/m a 1 km con 1 kW)', gainDbi: 5.15 },
  { id: 'media', label: 'Monopolo de 0,625 λ (≈410 mV/m a 1 km con 1 kW)', gainDbi: 7.5 },
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
