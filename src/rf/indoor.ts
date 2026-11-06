// Propagación en interiores: modelo multipared (COST-231 Multi-Wall) con pérdidas por material.
// L = espacio libre + exceso por mobiliario y personas + suma de las pérdidas de cada muro que
// cruza la línea directa, cada una corregida por el ángulo con que la cruza. Módulo puro.

import { freeSpaceLossDb } from './fieldStrength';

export type WifiBand = '2.4' | '5' | '6';

export const WIFI_BANDS: readonly { id: WifiBand; label: string; frequencyMHz: number }[] = [
  { id: '2.4', label: '2,4 GHz', frequencyMHz: 2437 },
  { id: '5', label: '5 GHz', frequencyMHz: 5500 },
  { id: '6', label: '6 GHz', frequencyMHz: 6175 },
];

export type MaterialId =
  | 'drywall'
  | 'madera'
  | 'vidrio'
  | 'vidrio-reflectivo'
  | 'ladrillo'
  | 'bloque'
  | 'concreto'
  | 'metal';

export interface Material {
  id: MaterialId;
  label: string;
  /** Color con que se dibuja en el plano. */
  color: string;
  /** Grosor con que se dibuja (px). */
  drawWidth: number;
  /** Pérdida al atravesarlo (dB) en cada banda. */
  lossDb: Record<WifiBand, number>;
}

/**
 * Pérdidas típicas por material (dB), recopiladas de la ITU-R P.2040 y de guías de diseño WiFi.
 * Varían con el grosor y la humedad: son un punto de partida para ajustar con mediciones.
 */
export const MATERIALS: readonly Material[] = [
  { id: 'drywall', label: 'Drywall o tabique de yeso', color: '#9aa4b1', drawWidth: 4, lossDb: { '2.4': 3, '5': 4, '6': 4.5 } },
  { id: 'madera', label: 'Puerta o muro de madera', color: '#a8723c', drawWidth: 5, lossDb: { '2.4': 3, '5': 4, '6': 5 } },
  { id: 'vidrio', label: 'Ventana de vidrio', color: '#54aeff', drawWidth: 3, lossDb: { '2.4': 2, '5': 3, '6': 4 } },
  { id: 'vidrio-reflectivo', label: 'Vidrio reflectivo (low-e)', color: '#0550ae', drawWidth: 3, lossDb: { '2.4': 25, '5': 30, '6': 32 } },
  { id: 'ladrillo', label: 'Muro de ladrillo', color: '#c4553a', drawWidth: 7, lossDb: { '2.4': 8, '5': 12, '6': 14 } },
  { id: 'bloque', label: 'Bloque de concreto', color: '#7d7d7d', drawWidth: 7, lossDb: { '2.4': 10, '5': 15, '6': 17 } },
  { id: 'concreto', label: 'Concreto o muro de carga', color: '#4a4a4a', drawWidth: 9, lossDb: { '2.4': 15, '5': 22, '6': 25 } },
  { id: 'metal', label: 'Metal (puerta, ascensor, gabinete)', color: '#1f2328', drawWidth: 6, lossDb: { '2.4': 30, '5': 35, '6': 38 } },
];

export function materialById(id: MaterialId): Material {
  return MATERIALS.find((m) => m.id === id)!;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Si los segmentos AB y CD se cruzan (sin contar el solo roce en un extremo). */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, s: Segment): boolean {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = s.x2 - s.x1;
  const d2y = s.y2 - s.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false; // paralelos
  const t = ((s.x1 - ax) * d2y - (s.y1 - ay) * d2x) / denom;
  const u = ((s.x1 - ax) * d1y - (s.y1 - ay) * d1x) / denom;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1;
}

/** Distancia mínima del modelo (m): más cerca del AP se toma la pérdida a 1 m. */
const MIN_DISTANCE_M = 1;

/** Tope del factor por ángulo: un muro casi rasante no suma más del doble de su pérdida. */
export const MAX_INCIDENCE_FACTOR = 2;

/**
 * Factor por el ángulo con que la línea AP → punto cruza un muro: 1/cos θ, con θ entre la línea y
 * la normal (perpendicular) del muro, con tope en 2. A 0° (de frente) vale 1; a 60°, 2.
 *
 * Es la corrección geométrica del grosor recorrido (un rayo a 60° recorre el doble de material),
 * como en las variantes del modelo multipared que ponderan la pérdida por 1/cos θ. La refracción
 * acorta el recorrido dentro del muro, pero en ángulos grandes crece la reflexión en la cara del
 * muro (Fresnel, ITU-R P.2040): el tope en 2 evita que un rayo casi paralelo sume pérdidas absurdas.
 */
export function wallIncidenceFactor(dx: number, dy: number, wall: Segment): number {
  const wx = wall.x2 - wall.x1;
  const wy = wall.y2 - wall.y1;
  const lengths = Math.hypot(dx, dy) * Math.hypot(wx, wy);
  if (lengths === 0) return 1;
  // cos θ con la normal = |sen| del ángulo entre la línea y el muro = |producto cruz| / largos.
  const cosTheta = Math.abs(dx * wy - dy * wx) / lengths;
  return cosTheta <= 1 / MAX_INCIDENCE_FACTOR ? MAX_INCIDENCE_FACTOR : 1 / cosTheta;
}

/**
 * Mobiliario y personas: lo que el usuario no dibuja (escritorios, estantes, gente) también atenúa.
 * Se modela como un exponente de distancia `n` mayor que el del espacio libre (2) a partir de 1 m,
 * la distancia de referencia del modelo log-distancia (ITU-R P.1238, Rappaport):
 *   exceso (dB) = 10·(n − 2)·log10(d / 1 m)
 *
 * Para no contar dos veces los muros, el exponente NO sale del N de la ITU-R P.1238 (N = 30 en
 * oficinas a 2,4 GHz, N = 31 a 5,2 GHz), porque ese N ya incluye los muros del piso y aquí cada muro
 * se dibuja con su material. Se usa el de oficinas con divisiones blandas (puestos de trabajo,
 * mobiliario), sin muros: n = 2,6 (Rappaport, "Wireless Communications", tabla 4.2, mediciones de
 * Andersen et al. a 1,9 GHz). Para una casa amueblada, con menos mobiliario y gente por metro
 * cuadrado, se toma n = 2,4, a medio camino con el espacio libre; es un criterio, no una medición.
 */
export type FurnitureId = 'vacio' | 'casa' | 'oficina';

export const FURNITURE: readonly { id: FurnitureId; label: string; exponent: number }[] = [
  { id: 'vacio', label: 'Espacio vacío (espacio libre)', exponent: 2 },
  { id: 'casa', label: 'Casa amueblada', exponent: 2.4 },
  { id: 'oficina', label: 'Oficina con puestos', exponent: 2.6 },
];

export function furnitureById(id: FurnitureId): { id: FurnitureId; label: string; exponent: number } {
  return FURNITURE.find((f) => f.id === id)!;
}

/** Pérdida adicional (dB) por mobiliario y personas a `distanceM` metros con exponente `exponent`. */
export function furnitureExcessDb(distanceM: number, exponent: number): number {
  if (distanceM <= MIN_DISTANCE_M) return 0;
  return 10 * (exponent - 2) * Math.log10(distanceM / MIN_DISTANCE_M);
}

/**
 * Pérdida multipared (dB) entre el AP y un punto, con distancias en metros: espacio libre a la
 * distancia directa + exceso por mobiliario (exponente `exponent`, 2 = espacio vacío) + pérdida de
 * cada muro cruzado multiplicada por su factor de ángulo. La pérdida es la misma en los dos sentidos.
 */
export function multiWallLossDb(
  ax: number,
  ay: number,
  px: number,
  py: number,
  walls: readonly (Segment & { material: MaterialId })[],
  band: WifiBand,
  frequencyMHz: number,
  exponent = 2,
): { lossDb: number; wallsCrossed: number } {
  const d = Math.max(MIN_DISTANCE_M, Math.hypot(px - ax, py - ay));
  let loss = freeSpaceLossDb(d / 1000, frequencyMHz) + furnitureExcessDb(d, exponent);
  let crossed = 0;
  for (const wall of walls) {
    if (segmentsCross(ax, ay, px, py, wall)) {
      loss += materialById(wall.material).lossDb[band] * wallIncidenceFactor(px - ax, py - ay, wall);
      crossed++;
    }
  }
  return { lossDb: loss, wallsCrossed: crossed };
}

// --- Canal, sensibilidad y límites de potencia ---

export type ChannelWidth = 20 | 40 | 80 | 160;

/** Anchos de canal posibles en cada banda (en 2,4 GHz solo caben canales de 20 y 40 MHz). */
export const CHANNEL_WIDTHS: Record<WifiBand, readonly ChannelWidth[]> = {
  '2.4': [20, 40],
  '5': [20, 40, 80, 160],
  '6': [20, 40, 80, 160],
};

/**
 * Ancho por omisión: 20 MHz en 2,4 GHz (solo hay 3 canales sin traslape); 40 MHz en 5 GHz, el
 * término medio entre velocidad y reúso de canales cuando hay varios AP; 80 MHz en 6 GHz, donde
 * sobra espectro y además el límite de PIRE sube con el ancho (24 dBm a 80 MHz).
 */
export const DEFAULT_CHANNEL_WIDTH: Record<WifiBand, ChannelWidth> = { '2.4': 20, '5': 40, '6': 80 };

/** Potencia típica de un celular o portátil (dBm, antena de 0 dBi): 15 dBm en 2,4 GHz y 13 dBm en 5 y 6 GHz. */
export const DEFAULT_CLIENT_POWER_DBM: Record<WifiBand, number> = { '2.4': 15, '5': 13, '6': 13 };

/**
 * Sensibilidad mínima en MCS0 (la modulación más robusta) que exige el estándar 802.11ax: −82 dBm a
 * 20 MHz y 3 dB peor por cada vez que se duplica el ancho, porque el receptor recoge el doble de ruido.
 */
export const MCS0_SENSITIVITY_DBM: Record<ChannelWidth, number> = { 20: -82, 40: -79, 80: -76, 160: -73 };

/**
 * Límite de PIRE (dBm) en 6 GHz, solo interiores. ANE, Resolución 737 de 2022 (anexo 1, literal
 * 3.8.3): densidad de PIRE de 5 dBm/MHz para el AP y −1 dBm/MHz para el cliente, y PIRE máxima de
 * 30 dBm y 24 dBm; igual que el LPI de la FCC (47 CFR 15.407).
 * PIRE máxima = densidad + 10·log10(ancho en MHz), sin pasar del tope: AP 18 dBm a 20 MHz, 21 a 40,
 * 24 a 80 y 27 a 160. En 2,4 y 5 GHz no se revisa límite (null).
 */
export function eirpLimitDbm(band: WifiBand, widthMHz: ChannelWidth, device: 'ap' | 'client'): number | null {
  if (band !== '6') return null;
  const psdDbmPerMHz = device === 'ap' ? 5 : -1;
  const capDbm = device === 'ap' ? 30 : 24;
  return Math.min(capDbm, psdDbmPerMHz + 10 * Math.log10(widthMHz));
}

/** PIRE con que se calcula (dBm): la del equipo, recortada al límite legal si lo hay. */
export function effectiveEirpDbm(eirpDbm: number, limitDbm: number | null): number {
  return limitDbm === null ? eirpDbm : Math.min(eirpDbm, limitDbm);
}

/** Umbrales de señal WiFi (dBm) y su significado práctico. */
export const WIFI_THRESHOLDS: readonly { dbm: number; label: string }[] = [
  { dbm: -50, label: 'excelente' },
  { dbm: -60, label: 'muy buena' },
  { dbm: -67, label: 'buena para voz y video' },
  { dbm: -75, label: 'aceptable para navegar' },
  { dbm: -85, label: 'débil, se corta' },
];
