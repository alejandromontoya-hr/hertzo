// Pérdida por el entorno del equipo (edificios, árboles, casetas): Recomendación UIT-R P.2108-1
// (2021), sección 3.1, "corrección del terminal por ganancia de altura". Módulo puro.
//
// El ITM solo ve el relieve; esta corrección suma lo que pierde un equipo que está por debajo
// de la altura de lo que lo rodea. Según la norma, el trayecto se calcula con el equipo a esa
// altura (por encima del entorno) y luego se suma esta pérdida. Vale de 30 MHz a 3 GHz.

export type ClutterType = 'abierto' | 'suburbano' | 'urbano' | 'urbano-denso';

export interface ClutterTypeInfo {
  id: ClutterType;
  label: string;
  /** Altura representativa de lo que rodea al equipo (m), tabla 3 de la norma. */
  heightM: number;
  /** Difracción sobre techos (ec. 2a) o ganancia de altura sobre suelo abierto (ec. 2b). */
  diffraction: boolean;
}

/** Tabla 3 de la P.2108-1: alturas por defecto cuando no hay información local. */
export const CLUTTER_TYPES: readonly ClutterTypeInfo[] = [
  { id: 'abierto', label: 'Abierto o rural', heightM: 10, diffraction: false },
  { id: 'suburbano', label: 'Suburbano', heightM: 10, diffraction: true },
  { id: 'urbano', label: 'Urbano o arbolado', heightM: 15, diffraction: true },
  { id: 'urbano-denso', label: 'Urbano denso', heightM: 20, diffraction: true },
];

/** Ancho de calle que usa la norma cuando no hay información local (m). */
export const DEFAULT_STREET_WIDTH_M = 27;

/** Entorno de un extremo del trayecto: tipo y altura de lo que lo rodea. */
export interface Clutter {
  type: ClutterType;
  heightM: number;
}

/** Aproximación de la difracción en filo de cuchillo, ec. (1); vale 0 para ν ≤ −0,78. */
export function knifeEdgeLossDb(nu: number): number {
  if (nu <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((nu - 0.1) ** 2 + 1) + nu - 0.1);
}

/**
 * Pérdida adicional Ah (dB) de un equipo a `antennaHeightM` dentro de un entorno, ec. (2).
 * Si la antena está a la altura del entorno o por encima, no suma nada.
 * Urbano, 15 m, equipo a 2 m, 916,8 MHz: 22,35 dB.
 */
export function clutterLossDb(
  frequencyMHz: number,
  antennaHeightM: number,
  clutter: Clutter,
  streetWidthM: number = DEFAULT_STREET_WIDTH_M,
): number {
  const r = clutter.heightM;
  const h = antennaHeightM;
  if (h >= r) return 0;
  const fGHz = frequencyMHz / 1000;
  const info = CLUTTER_TYPES.find((t) => t.id === clutter.type)!;
  if (!info.diffraction) {
    // Ec. (2b) con (2f): Kh2 = 21,8 + 6,2·log f.
    const kh2 = 21.8 + 6.2 * Math.log10(fGHz);
    return -kh2 * Math.log10(h / r);
  }
  // Ec. (2a) con (2c) a (2e) y (2g): θ en grados, como dice la norma.
  const hDif = r - h;
  const thetaDeg = (Math.atan(hDif / streetWidthM) * 180) / Math.PI;
  const nu = 0.342 * Math.sqrt(fGHz) * Math.sqrt(hDif * thetaDeg);
  return knifeEdgeLossDb(nu) - 6.03;
}

/** Altura (m) a la que se calcula el trayecto: la del entorno si el equipo está por debajo. */
export function pathHeightM(antennaHeightM: number, clutter: Clutter | null): number {
  return clutter ? Math.max(antennaHeightM, clutter.heightM) : antennaHeightM;
}
