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
}

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

/** Atenuación total de la galería en la zona guiada (dB/m). */
export function galleryAttenuationDbPerM(
  frequencyMHz: number,
  gallery: GalleryGeometry,
  rock: RockProperties,
  polarization: Polarization,
): number {
  return (
    modalAttenuationDbPerM(frequencyMHz, gallery, rock, polarization) +
    roughnessAttenuationDbPerM(frequencyMHz, gallery, rock.roughnessM)
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
 * Pérdida empírica en una curva o cruce de 90° (dB). Las frecuencias altas difractan menos y
 * pierden más al doblar: ~17 dB en VHF, ~25 dB a 900 MHz, ~29 dB a 2,4 GHz.
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

/** Valores típicos de un cable radiante de 1/2" (pérdida longitudinal y acople al 95 % a 2 m). */
export function typicalLeakyCable(frequencyMHz: number): LeakyCable {
  if (frequencyMHz < 30) return { longitudinalDbPer100m: 0.5, couplingLossDb: 55 };
  if (frequencyMHz < 120) return { longitudinalDbPer100m: 1.5, couplingLossDb: 60 };
  if (frequencyMHz < 300) return { longitudinalDbPer100m: 2, couplingLossDb: 65 };
  if (frequencyMHz < 600) return { longitudinalDbPer100m: 3.6, couplingLossDb: 70 };
  if (frequencyMHz < 1200) return { longitudinalDbPer100m: 5, couplingLossDb: 75 };
  return { longitudinalDbPer100m: 10, couplingLossDb: 80 };
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
