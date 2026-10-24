// Enlaces punto a punto: zona de Fresnel, curvatura de la Tierra, difracción por aristas,
// antenas parabólicas y disponibilidad. Módulo puro.

const SPEED_OF_LIGHT = 299792458;
const EARTH_RADIUS_M = 6371000;

export function wavelengthM(frequencyMHz: number): number {
  return SPEED_OF_LIGHT / (frequencyMHz * 1e6);
}

/** Radio de la zona de Fresnel n (m) a d1 y d2 metros de cada extremo: √(n·λ·d1·d2 / (d1 + d2)). */
export function fresnelRadiusM(d1M: number, d2M: number, frequencyMHz: number, n = 1): number {
  if (d1M <= 0 || d2M <= 0) return 0;
  return Math.sqrt((n * wavelengthM(frequencyMHz) * d1M * d2M) / (d1M + d2M));
}

/** Cuánto «sube» el terreno por la curvatura de la Tierra con factor k (m): d1·d2 / (2·k·R). */
export function earthBulgeM(d1M: number, d2M: number, kFactor: number): number {
  return (d1M * d2M) / (2 * kFactor * EARTH_RADIUS_M);
}

/** Parámetro de difracción de Fresnel-Kirchhoff v para un obstáculo h metros sobre la línea. */
export function fresnelParameterV(heightAboveLineM: number, d1M: number, d2M: number, frequencyMHz: number): number {
  return heightAboveLineM * Math.sqrt((2 * (d1M + d2M)) / (wavelengthM(frequencyMHz) * d1M * d2M));
}

/** Pérdida por una arista (ITU-R P.526): J(v) = 6,9 + 20·log(√((v − 0,1)² + 1) + v − 0,1) si v > −0,78. */
export function knifeEdgeLossDb(v: number): number {
  if (v <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

export interface PathProfile {
  /** Distancia de cada muestra al extremo A (m). */
  distancesM: ArrayLike<number>;
  /** Cota del terreno en cada muestra (m). */
  elevationsM: ArrayLike<number>;
}

export interface LinkGeometryInput {
  profile: PathProfile;
  /** Altura de la antena sobre el suelo en A y en B (m). */
  heightAM: number;
  heightBM: number;
  frequencyMHz: number;
  kFactor: number;
}

export interface ClearancePoint {
  distanceM: number;
  /** Cota del terreno más el abultamiento de la Tierra (m). */
  terrainM: number;
  /** Altura de la línea entre antenas (m). */
  lineM: number;
  /** Radio de la primera zona de Fresnel (m). */
  fresnelM: number;
  /** Despeje: línea menos terreno (m); negativo si el terreno corta la línea. */
  clearanceM: number;
}

/** Despeje de la primera zona de Fresnel en cada muestra del perfil. */
export function clearanceProfile(input: LinkGeometryInput): ClearancePoint[] {
  const { distancesM: d, elevationsM: e } = input.profile;
  const n = d.length;
  const total = d[n - 1]!;
  const hA = e[0]! + input.heightAM;
  const hB = e[n - 1]! + input.heightBM;
  const points: ClearancePoint[] = [];
  for (let i = 0; i < n; i++) {
    const d1 = d[i]!;
    const d2 = total - d1;
    const terrain = e[i]! + earthBulgeM(d1, d2, input.kFactor);
    const line = hA + ((hB - hA) * d1) / total;
    points.push({
      distanceM: d1,
      terrainM: terrain,
      lineM: line,
      fresnelM: fresnelRadiusM(d1, d2, input.frequencyMHz),
      clearanceM: line - terrain,
    });
  }
  return points;
}

export interface MinClearance {
  /** Despeje mínimo como fracción de la primera zona de Fresnel (1 = 100 %). */
  ratio: number;
  distanceM: number;
  clearanceM: number;
}

/** Punto del perfil (sin contar los extremos) con menor despeje relativo a la zona de Fresnel. */
export function minClearance(points: readonly ClearancePoint[]): MinClearance {
  let best: MinClearance = { ratio: Infinity, distanceM: 0, clearanceM: Infinity };
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    if (p.fresnelM <= 0) continue;
    const ratio = p.clearanceM / p.fresnelM;
    if (ratio < best.ratio) best = { ratio, distanceM: p.distanceM, clearanceM: p.clearanceM };
  }
  return best;
}

export interface DiffractionEdge {
  distanceM: number;
  v: number;
  lossDb: number;
}

/**
 * Pérdida por difracción con el método de Deygout (hasta 3 aristas): la arista principal es la
 * de mayor v entre A y B; luego se busca la principal a cada lado de ella.
 */
export function deygoutLoss(input: LinkGeometryInput): { lossDb: number; edges: DiffractionEdge[] } {
  const { distancesM: d, elevationsM: e } = input.profile;
  const n = d.length;
  const total = d[n - 1]!;
  const terrain = (i: number) => e[i]! + earthBulgeM(d[i]!, total - d[i]!, input.kFactor);
  const edges: DiffractionEdge[] = [];

  /** Arista de mayor v entre las muestras a y b, con los extremos a las alturas dadas. */
  const principal = (a: number, b: number, hA: number, hB: number): DiffractionEdge & { index: number } | null => {
    let best: (DiffractionEdge & { index: number }) | null = null;
    for (let i = a + 1; i < b; i++) {
      const d1 = d[i]! - d[a]!;
      const d2 = d[b]! - d[i]!;
      const line = hA + ((hB - hA) * d1) / (d1 + d2);
      const v = fresnelParameterV(terrain(i) - line, d1, d2, input.frequencyMHz);
      if (!best || v > best.v) best = { index: i, distanceM: d[i]!, v, lossDb: knifeEdgeLossDb(v) };
    }
    return best && best.v > -0.78 ? best : null;
  };

  const hA = e[0]! + input.heightAM;
  const hB = e[n - 1]! + input.heightBM;
  const main = principal(0, n - 1, hA, hB);
  if (!main) return { lossDb: 0, edges };
  edges.push(main);
  const top = terrain(main.index);
  const left = principal(0, main.index, hA, top);
  const right = principal(main.index, n - 1, top, hB);
  if (left) edges.push(left);
  if (right) edges.push(right);
  return { lossDb: edges.reduce((sum, edge) => sum + edge.lossDb, 0), edges };
}

/** Ganancia de una antena parabólica (dBi): 10·log(η·(π·D/λ)²), eficiencia típica 0,55. */
export function parabolicGainDbi(diameterM: number, frequencyMHz: number, efficiency = 0.55): number {
  return 10 * Math.log10(efficiency * ((Math.PI * diameterM) / wavelengthM(frequencyMHz)) ** 2);
}

/**
 * Atenuación aproximada por gases atmosféricos (dB/km) a nivel del mar con 7,5 g/m³ de vapor,
 * interpolada de la ITU-R P.676. Pesa por encima de 10 GHz (pico del vapor de agua en 22 GHz).
 */
const GASEOUS_TABLE: readonly [number, number][] = [
  [1, 0.006],
  [6, 0.009],
  [10, 0.013],
  [15, 0.035],
  [18, 0.07],
  [20, 0.12],
  [22.2, 0.2],
  [26, 0.13],
  [30, 0.12],
  [38, 0.13],
  [42, 0.18],
];

export function gaseousAttenuationDbPerKm(frequencyMHz: number): number {
  const f = frequencyMHz / 1000;
  if (f <= GASEOUS_TABLE[0]![0]) return GASEOUS_TABLE[0]![1];
  for (let i = 1; i < GASEOUS_TABLE.length; i++) {
    const [f1, a1] = GASEOUS_TABLE[i]!;
    const [f0, a0] = GASEOUS_TABLE[i - 1]!;
    if (f <= f1) return a0 + ((a1 - a0) * (f - f0)) / (f1 - f0);
  }
  return GASEOUS_TABLE[GASEOUS_TABLE.length - 1]![1];
}

/** Factor de terreno y clima de Vigants-Barnett. */
export const CLIMATE_FACTORS: readonly { id: string; label: string; c: number }[] = [
  { id: 'agua', label: 'Sobre agua o llanura húmeda (C = 4)', c: 4 },
  { id: 'promedio', label: 'Terreno y clima promedio (C = 1)', c: 1 },
  { id: 'montana', label: 'Montañoso o seco (C = 0,25)', c: 0.25 },
];

/**
 * Probabilidad anual de corte por desvanecimiento multitrayecto (Vigants-Barnett):
 * P = 6·10⁻⁷ · C · f(GHz) · d(km)³ · 10^(−margen/10).
 */
export function multipathOutageProbability(frequencyMHz: number, distanceKm: number, fadeMarginDb: number, c: number): number {
  return Math.min(1, 6e-7 * c * (frequencyMHz / 1000) * distanceKm ** 3 * 10 ** (-fadeMarginDb / 10));
}

/** Ángulo de elevación (grados) para apuntar de un extremo al otro, con curvatura de la Tierra (k). */
export function elevationAngleDeg(heightFromM: number, heightToM: number, distanceM: number, kFactor: number): number {
  const drop = (distanceM * distanceM) / (2 * kFactor * EARTH_RADIUS_M);
  return (Math.atan2(heightToM - heightFromM - drop, distanceM) * 180) / Math.PI;
}
