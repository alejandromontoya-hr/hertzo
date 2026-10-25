// Escala de colores de los mapas de cobertura y clases del mapa de desbalance. Módulo puro.

/**
 * Umbrales de nivel recibido (dBm), de mayor a menor. Con la sensibilidad de cada dirección
 * forman 4 franjas; por debajo de la sensibilidad no se pinta.
 */
export const DEFAULT_LEVEL_THRESHOLDS_DBM: readonly number[] = [-80, -95, -105];

/**
 * Colores de las franjas, de la señal más fuerte a la más débil: verde, verde claro, amarillo
 * y rojo, la convención de los mapas de cobertura de radio.
 */
export const LEVEL_COLORS: readonly string[] = ['#1a9850', '#91cf60', '#f6d32d', '#d73027'];

/**
 * Franja de un nivel: 0 la más fuerte … 3 entre el umbral más bajo y la sensibilidad;
 * −1 si no llega a la sensibilidad. Los umbrales por debajo de la sensibilidad se ignoran.
 */
export function levelBand(levelDbm: number, sensitivityDbm: number, thresholdsDbm: readonly number[]): number {
  if (!(levelDbm >= sensitivityDbm)) return -1; // también descarta NaN
  const sorted = [...thresholdsDbm].sort((a, b) => b - a);
  for (let i = 0; i < sorted.length; i++) {
    if (levelDbm >= sorted[i]!) return i;
  }
  return sorted.length;
}

/** Texto de cada franja para la leyenda: "≥ -80 dBm", "-95 a -80 dBm", …, "-116 a -105 dBm". */
export function levelBandLabels(sensitivityDbm: number, thresholdsDbm: readonly number[]): string[] {
  const sorted = [...thresholdsDbm].sort((a, b) => b - a);
  const edges = [...sorted, sensitivityDbm];
  return edges.map((low, i) => (i === 0 ? `≥ ${low} dBm` : `${low} a ${edges[i - 1]} dBm`));
}

export type BalanceClass = 'both' | 'talkOutOnly' | 'talkInOnly' | 'none';

/** Clase de desbalance según el margen (dB) de bajada y de subida en un punto. */
export function balanceClass(talkOutMarginDb: number, talkInMarginDb: number): BalanceClass {
  const out = talkOutMarginDb >= 0;
  const inn = talkInMarginDb >= 0;
  if (out && inn) return 'both';
  if (out) return 'talkOutOnly';
  if (inn) return 'talkInOnly';
  return 'none';
}

export const BALANCE_LEGEND: readonly { cls: BalanceClass; color: string; label: string }[] = [
  // Oscuro, medio y claro: se distinguen por claridad aunque no se distingan los tonos.
  { cls: 'both', color: '#1f5c8c', label: 'Bajada y subida llegan' },
  { cls: 'talkOutOnly', color: '#d95f0e', label: 'Solo bajada: oyes la repetidora, pero ella no te oye' },
  { cls: 'talkInOnly', color: '#a8b65a', label: 'Solo subida: la repetidora te oye, pero tú no la oyes' },
];

/** Bandera del ITM: ángulo de horizonte grande en el transmisor (el sitio), Warnings.h 0x0080. */
export const ITM_WARN_TX_HORIZON_ANGLE = 0x0080;

/** Baja confianza: el ITM advierte que, desde el sitio, sus aproximaciones de ángulo pequeño no aplican. */
export function isLowConfidence(warnings: number): boolean {
  return (warnings & ITM_WARN_TX_HORIZON_ANGLE) !== 0;
}

/** "#1a7f37" → [26, 127, 55] */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
