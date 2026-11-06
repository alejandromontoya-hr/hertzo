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

/** Cuánto "sube" el terreno por la curvatura de la Tierra con factor k (m): d1·d2 / (2·k·R). */
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

/** k mediano (atmósfera estándar) y k desfavorable con que se juzga el despeje. */
export const MEDIAN_K = 4 / 3;
export const WORST_K = 2 / 3;

export interface ClearanceCriteria {
  /** Despeje mínimo con k = 4/3; debe librar el 100 % de F1. */
  median: MinClearance;
  /** Despeje mínimo con k = 2/3; debe librar el 60 % de F1. */
  worst: MinClearance;
  medianOk: boolean;
  worstOk: boolean;
}

/**
 * Criterio clásico de despeje para enlaces fijos: 100 % de la primera zona de Fresnel con k = 4/3
 * (condición mediana) y 60 % con k = 2/3 (subrefracción, que en trayectos largos o en clima
 * tropical húmedo baja el rayo hacia el terreno). Se exigen las dos y manda la peor.
 *
 * La ITU-R P.530-18 (§2.2.2.1) permite bajar al 0–30 % de F1 con el k excedido el 99,9 % del
 * tiempo cuando hay un solo obstáculo aislado, pero ese k sale de una curva que depende de la
 * longitud y del gradiente de refractividad local; aquí se usa el 60 % con k = 2/3, más
 * conservador y sin datos que el usuario no tiene.
 */
export function clearanceCriteria(input: Omit<LinkGeometryInput, 'kFactor'>): ClearanceCriteria {
  const median = minClearance(clearanceProfile({ ...input, kFactor: MEDIAN_K }));
  const worst = minClearance(clearanceProfile({ ...input, kFactor: WORST_K }));
  return { median, worst, medianOk: median.ratio >= 1, worstOk: worst.ratio >= 0.6 };
}

export interface DiffractionEdge {
  distanceM: number;
  v: number;
  lossDb: number;
}

/**
 * Pérdida por difracción con aristas en cascada de la UIT-R P.526-10 (§4.4.2, ecuaciones 46 a 48),
 * un Deygout de hasta 3 aristas: la principal p es la de mayor v entre A y B; luego se busca la
 * de mayor v entre A y p (t) y entre p y B (r). La pérdida es
 *   L = J(vp) + T·[J(vt) + J(vr) + C],  T = 1 − exp(−J(vp)/6),  C = 10 + 0,04·D (km).
 * T apaga las aristas secundarias cuando la principal casi no obstruye: en un perfil denso, la
 * muestra vecina de un cerro queda sobre la línea nueva (v ≈ 0, J ≈ 6 dB) y el Deygout puro
 * cobraría unos 11 dB de más con el 55 % de F1 libre. C es la corrección empírica de la UIT para
 * terreno real, que no es un filo ideal (la P.526-13 vigente la mantiene en el método Bullington).
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
  const t = 1 - Math.exp(-main.lossDb / 6);
  const c = 10 + 0.04 * (total / 1000);
  const lossDb = main.lossDb + t * ((left?.lossDb ?? 0) + (right?.lossDb ?? 0) + c);
  return { lossDb, edges };
}

/** Ganancia de una antena parabólica (dBi): 10·log(η·(π·D/λ)²), eficiencia típica 0,55. */
export function parabolicGainDbi(diameterM: number, frequencyMHz: number, efficiency = 0.55): number {
  return 10 * Math.log10(efficiency * ((Math.PI * diameterM) / wavelengthM(frequencyMHz)) ** 2);
}

/**
 * Atenuación aproximada por gases atmosféricos (dB/km) a nivel del mar con 7,5 g/m³ de vapor,
 * interpolada de la ITU-R P.676. Pesa por encima de 10 GHz (pico del vapor de agua en 22 GHz).
 * En sitios altos (Medellín a 1500 m, cerros a 2500 m o más) el aire es menos denso y lleva menos
 * vapor, así que la atenuación real es algo menor: la tabla a nivel del mar queda del lado
 * conservador y no se corrige por altitud.
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

/** Factor de terreno de Vigants-Barnett (a). */
export const TERRAIN_FACTORS: readonly { id: string; label: string; a: number }[] = [
  { id: 'agua', label: 'Sobre agua o llanura muy lisa (a = 4)', a: 4 },
  { id: 'promedio', label: 'Terreno promedio, algo ondulado (a = 1)', a: 1 },
  { id: 'montana', label: 'Montañoso o muy quebrado (a = 1/4)', a: 0.25 },
];

/** Factor de clima de Vigants-Barnett (b). */
export const CLIMATE_FACTORS: readonly { id: string; label: string; b: number }[] = [
  { id: 'humedo', label: 'Cálido y húmedo, costa o valle tropical (b = 1/2)', b: 0.5 },
  { id: 'promedio', label: 'Templado o interior (b = 1/4)', b: 0.25 },
  { id: 'seco', label: 'Seco o de alta montaña (b = 1/8)', b: 0.125 },
];

/**
 * Probabilidad anual de corte por desvanecimiento multitrayecto (Vigants-Barnett):
 * P = 6·10⁻⁷ · a · b · f(GHz) · d(km)³ · 10^(−margen/10), con a el factor de terreno y b el de clima.
 * Es la forma en km de la original en millas, a·b·2,5·10⁻⁶·f·D³ (2,5·10⁻⁶ / 1,609³ = 6,0·10⁻⁷).
 */
export function multipathOutageProbability(frequencyMHz: number, distanceKm: number, fadeMarginDb: number, a: number, b: number): number {
  return Math.min(1, 6e-7 * a * b * (frequencyMHz / 1000) * distanceKm ** 3 * 10 ** (-fadeMarginDb / 10));
}

/** Ángulo de elevación (grados) para apuntar de un extremo al otro, con curvatura de la Tierra (k). */
export function elevationAngleDeg(heightFromM: number, heightToM: number, distanceM: number, kFactor: number): number {
  const drop = (distanceM * distanceM) / (2 * kFactor * EARTH_RADIUS_M);
  return (Math.atan2(heightToM - heightFromM - drop, distanceM) * 180) / Math.PI;
}
