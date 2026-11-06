// Propagación en túneles, minas y cavernas. Módulo puro.
//
// Una galería se comporta como una guía de onda con paredes dieléctricas (Emslie, Lagace y
// Strong, 1975): cerca de la antena la señal cae como en espacio libre y, pasada la distancia
// de quiebre, queda guiada y pierde una cantidad fija de dB por metro, que crece con λ² y
// baja con el tamaño de la galería al cubo. Por eso AM y FM casi no avanzan en un túnel y
// UHF sí.

import { freeSpaceLossDb } from './fieldStrength';

const SPEED_OF_LIGHT = 299792458;

export type Polarization = 'vertical' | 'horizontal';

export interface GalleryGeometry {
  widthM: number;
  heightM: number;
}

export interface RockProperties {
  /** Permitividad relativa de la roca o el revestimiento. */
  epsilonR: number;
  /** Rugosidad de las paredes, valor cuadrático medio (m). */
  roughnessM: number;
  /** Inclinación de las paredes respecto al eje de la galería (grados). */
  tiltDeg: number;
}

/**
 * Inclinación típica de las paredes (grados). Es la que usa el tutorial de comunicaciones de
 * NIOSH (Advanced Tutorial on Wireless Communication and Electronic Tracking, parte 2): 1° da
 * 1,2 dB/100 pies a 900 MHz.
 */
export const DEFAULT_TILT_DEG = 1;

const wavelength = (frequencyMHz: number) => SPEED_OF_LIGHT / (frequencyMHz * 1e6);

/**
 * Atenuación del modo fundamental EH₁₁ (dB/m), Emslie et al. Para polarización vertical, las
 * paredes laterales (separadas por el ancho a) reflejan como TE y el piso y techo (separados
 * por la altura b) como TM, que pierde εr veces más:
 *   vertical:   4,343·λ²·(1/(a³·√(εr−1)) + εr/(b³·√(εr−1)))
 *   horizontal: 4,343·λ²·(εr/(a³·√(εr−1)) + 1/(b³·√(εr−1)))
 */
export function modalAttenuationDbPerM(
  frequencyMHz: number,
  gallery: GalleryGeometry,
  rock: RockProperties,
  polarization: Polarization,
): number {
  const lambda2 = wavelength(frequencyMHz) ** 2;
  const root = Math.sqrt(rock.epsilonR - 1);
  const a3 = gallery.widthM ** 3;
  const b3 = gallery.heightM ** 3;
  const sides = polarization === 'vertical' ? 1 / (a3 * root) : rock.epsilonR / (a3 * root);
  const floorCeiling = polarization === 'vertical' ? rock.epsilonR / (b3 * root) : 1 / (b3 * root);
  return 4.343 * lambda2 * (sides + floorCeiling);
}

/** Atenuación adicional por rugosidad de las paredes (dB/m): 4,343·π²·h²·λ·(1/a⁴ + 1/b⁴). */
export function roughnessAttenuationDbPerM(frequencyMHz: number, gallery: GalleryGeometry, roughnessM: number): number {
  return (
    4.343 *
    Math.PI ** 2 *
    roughnessM ** 2 *
    wavelength(frequencyMHz) *
    (1 / gallery.widthM ** 4 + 1 / gallery.heightM ** 4)
  );
}

/**
 * Atenuación por inclinación de las paredes (dB/m), Emslie et al.: 4,343·π²·θ²/λ, con θ en
 * radianes. A 900 MHz y 1° da 0,0392 dB/m (1,2 dB/100 pies, el valor de NIOSH). Crece con la
 * frecuencia: a 2,4 GHz y 1° ya son 10,6 dB/100 m.
 */
export function tiltAttenuationDbPerM(frequencyMHz: number, tiltDeg: number): number {
  const theta = (tiltDeg * Math.PI) / 180;
  return (4.343 * Math.PI ** 2 * theta ** 2) / wavelength(frequencyMHz);
}

/** Atenuación total de la galería en la zona guiada (dB/m): modal + rugosidad + inclinación. */
export function galleryAttenuationDbPerM(
  frequencyMHz: number,
  gallery: GalleryGeometry,
  rock: RockProperties,
  polarization: Polarization,
): number {
  return (
    modalAttenuationDbPerM(frequencyMHz, gallery, rock, polarization) +
    roughnessAttenuationDbPerM(frequencyMHz, gallery, rock.roughnessM) +
    tiltAttenuationDbPerM(frequencyMHz, rock.tiltDeg)
  );
}

/** Distancia de quiebre (m) entre la zona de espacio libre y la zona guiada: máx(a², b²)/λ. */
export function breakpointDistanceM(frequencyMHz: number, gallery: GalleryGeometry): number {
  return Math.max(gallery.widthM, gallery.heightM) ** 2 / wavelength(frequencyMHz);
}

/**
 * Frecuencia (MHz) por debajo de la cual la galería prácticamente deja de guiar la señal:
 * cuando λ/2 iguala su lado mayor (c / (2·máx(a, b))).
 */
export function cutoffFrequencyMHz(gallery: GalleryGeometry): number {
  return SPEED_OF_LIGHT / (2 * Math.max(gallery.widthM, gallery.heightM)) / 1e6;
}

/**
 * Pérdida de trayecto dentro de una galería recta (dB) con el modelo de dos tramos:
 * espacio libre hasta la distancia de quiebre y, desde ahí, la atenuación modal.
 */
export function tunnelPathLossDb(distanceM: number, frequencyMHz: number, attenuationDbPerM: number, breakpointM: number): number {
  const d = Math.max(1, distanceM);
  if (d <= breakpointM) return freeSpaceLossDb(d / 1000, frequencyMHz);
  return freeSpaceLossDb(breakpointM / 1000, frequencyMHz) + attenuationDbPerM * (d - breakpointM);
}

/**
 * Pérdida en una curva o cruce de 90° (dB). Constante empírica, sin fuente medida: hay que
 * calibrarla con mediciones de la mina o el túnel. Da ~17 dB en VHF, ~25 dB a 900 MHz y
 * ~29 dB a 2,4 GHz, pero esa subida con la frecuencia no está respaldada: NIOSH reporta lo
 * contrario, que UHF dobla las esquinas mejor que VHF (en VHF la galería ya atenúa tanto que
 * casi nada llega a la esquina). Los valores se dejan igual hasta tener una fuente.
 */
export function cornerLoss90Db(frequencyMHz: number): number {
  return 15 + 10 * Math.log10(Math.max(frequencyMHz, 10) / 100);
}

/** Pérdida al doblar un ángulo dado (grados), proporcional a la de 90° y con tope en 180°. */
export function bendLossDb(angleDeg: number, loss90Db: number): number {
  return (Math.min(Math.abs(angleDeg), 180) / 90) * loss90Db;
}

// --- Cable radiante (leaky feeder) ---

export interface LeakyCable {
  /** Pérdida longitudinal (dB por 100 m). */
  longitudinalDbPer100m: number;
  /** Pérdida de acople a 2 m del cable (dB). */
  couplingLossDb: number;
}

/**
 * Hoja de datos del cable radiante RFS RLKW12-50 de 1/2" (RADIAFLEX, 30 a 1950 MHz):
 * frecuencia (MHz), pérdida longitudinal (dB/100 m) y pérdida de acople al 95 % a 2 m (dB).
 * https://www.rfsworld.com/pim/product/html/RLKW12-50CPR
 */
const RLKW12_50: readonly [number, number, number][] = [
  [75, 2.17, 56],
  [150, 3.1, 64],
  [450, 5.74, 62],
  [800, 7.89, 63],
  [870, 8.33, 66],
  [900, 8.63, 66],
  [960, 8.92, 66],
  [1800, 20.6, 63],
  [1900, 21.62, 62],
];

/** Frecuencia más alta para la que el cable de referencia tiene datos (MHz). */
export const LEAKY_CABLE_MAX_MHZ = 1950;

/**
 * Cable radiante típico de 1/2" según la hoja del RFS RLKW12-50. Entre dos puntos de la
 * tabla, ambas pérdidas se interpolan en línea recta contra log(f). Por debajo de 75 MHz la
 * pérdida longitudinal baja con √f (la del cobre) y el acople se queda en el de 75 MHz. Por
 * encima de 1900 MHz se prolonga la pendiente 1800–1900 MHz (a 2437 MHz: 26,3 dB/100 m) y el
 * acople se queda en 62 dB: es una estimación fuera de la hoja (el cable llega a 1950 MHz),
 * por eso la página avisa que en 2,4 GHz se usa cable de otra serie o antenas.
 */
export function typicalLeakyCable(frequencyMHz: number): LeakyCable {
  const first = RLKW12_50[0]!;
  if (frequencyMHz <= first[0]) {
    return { longitudinalDbPer100m: first[1] * Math.sqrt(Math.max(frequencyMHz, 0) / first[0]), couplingLossDb: first[2] };
  }
  for (let i = 1; i < RLKW12_50.length; i++) {
    const [f1, l1, c1] = RLKW12_50[i - 1]!;
    const [f2, l2, c2] = RLKW12_50[i]!;
    if (frequencyMHz <= f2) {
      const t = Math.log(frequencyMHz / f1) / Math.log(f2 / f1);
      return { longitudinalDbPer100m: l1 + t * (l2 - l1), couplingLossDb: c1 + t * (c2 - c1) };
    }
  }
  const [f1, l1] = RLKW12_50[RLKW12_50.length - 2]!;
  const [f2, l2, c2] = RLKW12_50[RLKW12_50.length - 1]!;
  const t = Math.log(frequencyMHz / f1) / Math.log(f2 / f1);
  return { longitudinalDbPer100m: l1 + t * (l2 - l1), couplingLossDb: c2 };
}

/**
 * Nivel (dBm) a `radialM` del cable y `alongM` metros desde la cabecera:
 * potencia − pérdida longitudinal − acople a 2 m − 20·log(r/2).
 */
export function leakyCableLevelDbm(headPowerDbm: number, cable: LeakyCable, alongM: number, radialM: number): number {
  return (
    headPowerDbm -
    (cable.longitudinalDbPer100m * alongM) / 100 -
    cable.couplingLossDb -
    20 * Math.log10(Math.max(radialM, 2) / 2)
  );
}

// --- A través de la roca (baja frecuencia) ---

/** Profundidad de penetración en la roca (m): 503·√(ρ/f), con ρ en Ω·m y f en Hz. */
export function skinDepthM(resistivityOhmM: number, frequencyHz: number): number {
  return 503 * Math.sqrt(resistivityOhmM / frequencyHz);
}

/** Absorción al atravesar una capa de roca (dB): 8,686·z/δ. */
export function rockAbsorptionDb(depthM: number, resistivityOhmM: number, frequencyHz: number): number {
  return (8.686 * depthM) / skinDepthM(resistivityOhmM, frequencyHz);
}
