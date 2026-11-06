// Red de galerías de una mina, túnel o caverna, y propagación de la señal por ella.
// Las galerías se convierten en un grafo con un nodo cada pocos metros. Desde cada antena la
// señal avanza por el camino de menor pérdida: espacio libre hasta la distancia de quiebre,
// atenuación modal de cada galería después, y una pérdida extra en cada curva o cruce.
// El cable radiante alimenta a todos los nodos cercanos con su nivel de acople. Módulo puro.
// Bajada y subida van por separado: la pérdida del camino es la misma en las dos direcciones,
// pero en la bajada transmite el repetidor (o la cabecera del cable) y recibe el portátil, y en
// la subida transmite el portátil y recibe el repetidor.

import {
  bendLossDb,
  breakpointDistanceM,
  galleryAttenuationDbPerM,
  leakyCableLevelDbm,
  type LeakyCable,
  type Polarization,
  type RockProperties,
} from '../rf/tunnel';
import { freeSpaceLossDb } from '../rf/fieldStrength';

export interface Point {
  x: number;
  y: number;
}

export interface Gallery {
  id: string;
  name: string;
  points: Point[];
  widthM: number;
  heightM: number;
}

export interface CaveTransmitter {
  id: string;
  name: string;
  x: number;
  y: number;
  powerDbm: number;
  gainDbi: number;
}

export interface Cable {
  id: string;
  points: Point[];
  /** Potencia que entra al cable en su primer punto (dBm). */
  headPowerDbm: number;
}

export interface CaveModel {
  galleries: Gallery[];
  transmitters: CaveTransmitter[];
  cables: Cable[];
}

export interface RadioSettings {
  frequencyMHz: number;
  polarization: Polarization;
  rock: RockProperties;
  /** Pérdida en una curva de 90° (dB). */
  corner90Db: number;
  /** Ganancia de la antena del radio portátil (dBi), igual al recibir y al transmitir. */
  rxGainDbi: number;
  /** Potencia del portátil en la subida (dBm); null si la banda es solo de recepción (AM, FM). */
  portablePowerDbm: number | null;
  cable: LeakyCable;
}

export interface CaveGraph {
  x: Float64Array;
  y: Float64Array;
  /** Vecinos de cada nodo: [nodo, largo (m), galería]. */
  edges: { to: number; length: number; gallery: number }[][];
}

/** Separación máxima entre nodos (m). */
export const NODE_STEP_M = 2;

/**
 * Desde este giro acumulado (grados) se cuenta una curva en el resumen. Solo sirve para
 * contar: la pérdida se suma en proporción a cada giro, sin umbral, así una curva suave
 * hecha de muchos tramos de 20° pierde lo mismo que un codo del mismo ángulo total.
 */
const BEND_COUNT_DEG = 25;

const key = (x: number, y: number) => `${Math.round(x * 20)},${Math.round(y * 20)}`;

/** Grafo de nodos: los vértices que coinciden entre galerías se unen y forman los cruces. */
export function buildGraph(galleries: readonly Gallery[], stepM = NODE_STEP_M): CaveGraph {
  const xs: number[] = [];
  const ys: number[] = [];
  const index = new Map<string, number>();
  const edges: CaveGraph['edges'] = [];

  const nodeAt = (x: number, y: number, shared: boolean): number => {
    if (shared) {
      const k = key(x, y);
      const existing = index.get(k);
      if (existing !== undefined) return existing;
      index.set(k, xs.length);
    }
    xs.push(x);
    ys.push(y);
    edges.push([]);
    return xs.length - 1;
  };
  const link = (a: number, b: number, gallery: number) => {
    const length = Math.hypot(xs[b]! - xs[a]!, ys[b]! - ys[a]!);
    if (length <= 0) return;
    edges[a]!.push({ to: b, length, gallery });
    edges[b]!.push({ to: a, length, gallery });
  };

  galleries.forEach((gallery, g) => {
    const pts = gallery.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const segments = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / stepM));
      let previous = nodeAt(p.x, p.y, true);
      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const isVertex = s === segments;
        const node = nodeAt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, isVertex);
        link(previous, node, g);
        previous = node;
      }
    }
  });

  return { x: Float64Array.from(xs), y: Float64Array.from(ys), edges };
}

/** Nivel en cada nodo para una dirección (bajada o subida). */
export interface LinkLevels {
  /**
   * Bajada: nivel que recibe el portátil en el nodo (dBm). Subida: nivel que recibe la fuente
   * (repetidor o cabecera del cable) cuando el portátil transmite desde el nodo (dBm).
   * −Infinity si no llega nada.
   */
  levelDbm: Float64Array;
  /** Fuente del mejor nivel: índice de antena (≥ 0), −(cable + 1) para cables, o −1000 si ninguna. */
  source: Int32Array;
  /** Distancia por las galerías hasta la fuente (m). */
  pathM: Float64Array;
  /** Curvas en el camino (cada vez que el giro acumulado pasa de 25°). */
  bends: Int32Array;
  /** Pérdida sumada por curvas y cruces en el camino (dB). */
  bendLossDb: Float64Array;
}

export interface SimulationResult {
  downlink: LinkLevels;
  /** null si la banda no tiene subida (radiodifusión). */
  uplink: LinkLevels | null;
}

function emptyLevels(n: number): LinkLevels {
  return {
    levelDbm: new Float64Array(n).fill(-Infinity),
    source: new Int32Array(n).fill(-1000),
    pathM: new Float64Array(n),
    bends: new Int32Array(n),
    bendLossDb: new Float64Array(n),
  };
}

/** Camino de una fuente: ganancia del trayecto sin la potencia de quien transmite (dB). */
interface SourcePaths {
  gainDb: Float64Array;
  dist: Float64Array;
  bends: Int32Array;
  bendLossDb: Float64Array;
}

/** Montículo binario mínimo para Dijkstra. */
class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, v: number) {
    this.keys.push(k);
    this.values.push(v);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= this.keys[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.keys[0]!, this.values[0]!];
    const lastK = this.keys.pop()!;
    const lastV = this.values.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.values[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.values[a], this.values[b]] = [this.values[b]!, this.values[a]!];
  }
}

/** Nodo del grafo más cercano a un punto. */
export function nearestNode(graph: CaveGraph, x: number, y: number): { node: number; distanceM: number } {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.x.length; i++) {
    const d = Math.hypot(graph.x[i]! - x, graph.y[i]! - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { node: best, distanceM: bestD };
}

/**
 * Antenas que quedan fuera de las galerías: a más de medio ancho de la galería más cercana
 * (más un paso entre nodos). La roca no deja pasar la señal como el espacio libre, así que no
 * se usan en el cálculo y la página lo avisa.
 */
export function antennasOutsideGalleries(model: CaveModel, graph: CaveGraph): { antenna: CaveTransmitter; distanceM: number }[] {
  return model.transmitters.flatMap((antenna) => {
    const start = nearestNode(graph, antenna.x, antenna.y);
    if (start.node < 0) return [];
    const gallery = model.galleries[graph.edges[start.node]![0]?.gallery ?? 0];
    const limit = (gallery ? gallery.widthM / 2 : 0) + NODE_STEP_M;
    return start.distanceM > limit ? [{ antenna, distanceM: start.distanceM }] : [];
  });
}

function angleBetweenDeg(ax: number, ay: number, bx: number, by: number): number {
  const dot = ax * bx + ay * by;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/**
 * Paso de un nodo al siguiente: pérdida por el giro (proporcional al ángulo, sin umbral) y
 * si con él el giro acumulado desde la última curva contada pasa de 25°.
 */
function turnStep(
  graph: CaveGraph,
  u: number,
  v: number,
  length: number,
  dirX: Float64Array,
  dirY: Float64Array,
  turnSince: Float64Array,
  corner90Db: number,
): { dx: number; dy: number; lossDb: number; turn: number; counted: boolean } {
  const dx = (graph.x[v]! - graph.x[u]!) / length;
  const dy = (graph.y[v]! - graph.y[u]!) / length;
  let angle = 0;
  if (dirX[u] !== 0 || dirY[u] !== 0) angle = angleBetweenDeg(dirX[u]!, dirY[u]!, dx, dy);
  const accumulated = turnSince[u]! + angle;
  const counted = accumulated > BEND_COUNT_DEG;
  return { dx, dy, lossDb: bendLossDb(angle, corner90Db), turn: counted ? 0 : accumulated, counted };
}

/** Un cable de 1° a 30° del eje de la galería todavía va por ella (cos 30° ≈ 0,87). */
const CABLE_PARALLEL_COS = Math.cos((30 * Math.PI) / 180);

/**
 * Si el punto (cx, cy) de un cable con dirección (ux, uy) va por dentro de una galería del nodo k:
 * alguno de sus tramos es casi paralelo al cable y el punto queda a no más de medio ancho (más
 * 0,5 m) del eje del tramo.
 */
function runsAlongGallery(
  graph: CaveGraph,
  galleries: readonly Gallery[],
  k: number,
  cx: number,
  cy: number,
  ux: number,
  uy: number,
): boolean {
  for (const edge of graph.edges[k]!) {
    const ex = (graph.x[edge.to]! - graph.x[k]!) / edge.length;
    const ey = (graph.y[edge.to]! - graph.y[k]!) / edge.length;
    if (Math.abs(ex * ux + ey * uy) < CABLE_PARALLEL_COS) continue;
    // Distancia del punto del cable a la recta del tramo.
    const offset = Math.abs((cx - graph.x[k]!) * ey - (cy - graph.y[k]!) * ex);
    if (offset <= galleries[edge.gallery]!.widthM / 2 + 0.5) return true;
  }
  return false;
}

export function simulate(model: CaveModel, graph: CaveGraph, settings: RadioSettings): SimulationResult {
  const n = graph.x.length;
  const downlink = emptyLevels(n);
  const portablePowerDbm = settings.portablePowerDbm;
  const uplink = portablePowerDbm === null ? null : emptyLevels(n);
  if (n === 0) return { downlink, uplink };

  const alpha = model.galleries.map((g) =>
    galleryAttenuationDbPerM(settings.frequencyMHz, g, settings.rock, settings.polarization),
  );
  const breakpoint = model.galleries.map((g) => breakpointDistanceM(settings.frequencyMHz, g));

  /** Guarda en `levels` el nivel de esta fuente donde sea el mejor. */
  const merge = (levels: LinkLevels, paths: SourcePaths, txPowerDbm: number, sourceId: number) => {
    for (let i = 0; i < n; i++) {
      const level = txPowerDbm + paths.gainDb[i]!;
      if (level > levels.levelDbm[i]!) {
        levels.levelDbm[i] = level;
        levels.source[i] = sourceId;
        levels.pathM[i] = paths.dist[i]!;
        levels.bends[i] = paths.bends[i]!;
        levels.bendLossDb[i] = paths.bendLossDb[i]!;
      }
    }
  };
  /** Bajada con la potencia de la fuente; subida con la del portátil, por el mismo camino. */
  const mergeBoth = (paths: SourcePaths, sourcePowerDbm: number, sourceId: number) => {
    merge(downlink, paths, sourcePowerDbm, sourceId);
    if (uplink && portablePowerDbm !== null) merge(uplink, paths, portablePowerDbm, sourceId);
  };

  // --- Antenas: camino de menor pérdida con espacio libre hasta el quiebre ---
  const outside = new Set(antennasOutsideGalleries(model, graph).map((o) => o.antenna));
  model.transmitters.forEach((tx, t) => {
    if (outside.has(tx)) return;
    const start = nearestNode(graph, tx.x, tx.y);
    if (start.node < 0) return;
    const firstGallery = graph.edges[start.node]![0]?.gallery ?? 0;
    const alpha0 = alpha[firstGallery]!;
    const bp0 = breakpoint[firstGallery]!;
    const dist = new Float64Array(n).fill(Infinity);
    const modal = new Float64Array(n);
    const bendLoss = new Float64Array(n);
    const bendCount = new Int32Array(n);
    const turnSince = new Float64Array(n);
    const dirX = new Float64Array(n);
    const dirY = new Float64Array(n);
    const best = new Float64Array(n).fill(Infinity);
    const lossOf = (d: number, a: number, b: number) => {
      const near = Math.min(Math.max(d, 1), bp0);
      return freeSpaceLossDb(near / 1000, settings.frequencyMHz) + Math.max(0, a - alpha0 * near) + b;
    };
    const heap = new MinHeap();
    dist[start.node] = start.distanceM;
    best[start.node] = lossOf(start.distanceM, 0, 0);
    heap.push(best[start.node]!, start.node);
    while (heap.size) {
      const [loss, u] = heap.pop();
      if (loss > best[u]!) continue;
      for (const edge of graph.edges[u]!) {
        const v = edge.to;
        const step = turnStep(graph, u, v, edge.length, dirX, dirY, turnSince, settings.corner90Db);
        const d = dist[u]! + edge.length;
        const a = modal[u]! + alpha[edge.gallery]! * edge.length;
        const b = bendLoss[u]! + step.lossDb;
        const candidate = lossOf(d, a, b);
        if (candidate < best[v]!) {
          best[v] = candidate;
          dist[v] = d;
          modal[v] = a;
          bendLoss[v] = b;
          bendCount[v] = bendCount[u]! + (step.counted ? 1 : 0);
          turnSince[v] = step.turn;
          dirX[v] = step.dx;
          dirY[v] = step.dy;
          heap.push(candidate, v);
        }
      }
    }
    // Ganancia del trayecto: antena del repetidor + antena del portátil − pérdida.
    const gainDb = best.map((loss) => tx.gainDbi + settings.rxGainDbi - loss);
    mergeBoth({ gainDb, dist, bends: bendCount, bendLossDb: bendLoss }, tx.powerDbm, t);
  });

  // --- Cables radiantes: alimentan los nodos cercanos y de ahí se propaga por las galerías ---
  model.cables.forEach((cable, c) => {
    // Ganancia desde la cabecera hasta cada nodo junto al cable, sin la potencia de la cabecera:
    // pérdida longitudinal + acople + distancia al cable. En la subida es el mismo camino al revés.
    const seed = new Float64Array(n).fill(-Infinity);
    const seedDirX = new Float64Array(n);
    const seedDirY = new Float64Array(n);
    let along = 0;
    for (let i = 0; i < cable.points.length - 1; i++) {
      const p = cable.points[i]!;
      const q = cable.points[i + 1]!;
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length <= 0) continue;
      const ux = (q.x - p.x) / length;
      const uy = (q.y - p.y) / length;
      const steps = Math.max(1, Math.ceil(length / NODE_STEP_M));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = p.x + (q.x - p.x) * t;
        const cy = p.y + (q.y - p.y) * t;
        for (let k = 0; k < n; k++) {
          const r = Math.hypot(graph.x[k]! - cx, graph.y[k]! - cy);
          if (r > 8) continue;
          // Solo los nodos de la galería por donde va el cable: la señal llega a una cruzada por el
          // grafo, que cobra la curva, y no atraviesa la roca hasta una galería vecina.
          if (!runsAlongGallery(graph, model.galleries, k, cx, cy, ux, uy)) continue;
          const gain = leakyCableLevelDbm(0, settings.cable, along + length * t, r) + settings.rxGainDbi;
          if (gain > seed[k]!) {
            seed[k] = gain;
            seedDirX[k] = ux;
            seedDirY[k] = uy;
          }
        }
      }
      along += length;
    }
    // Dijkstra sobre la pérdida desde el acople de cada nodo sembrado.
    const best = new Float64Array(n).fill(Infinity);
    const dist = new Float64Array(n);
    const bendCount = new Int32Array(n);
    const bendLoss = new Float64Array(n);
    const turnSince = new Float64Array(n);
    const dirX = new Float64Array(n);
    const dirY = new Float64Array(n);
    const heap = new MinHeap();
    /** Nodo sembrado por el cable: su dirección es la del cable, que no tiene sentido de avance. */
    const onCable = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (seed[k] === -Infinity) continue;
      best[k] = -seed[k]!;
      dirX[k] = seedDirX[k]!;
      dirY[k] = seedDirY[k]!;
      onCable[k] = 1;
      heap.push(best[k]!, k);
    }
    while (heap.size) {
      const [cost, u] = heap.pop();
      if (cost > best[u]!) continue;
      for (const edge of graph.edges[u]!) {
        const v = edge.to;
        let step = turnStep(graph, u, v, edge.length, dirX, dirY, turnSince, settings.corner90Db);
        if (onCable[u]) {
          // Desde el cable se puede seguir la galería en los dos sentidos: se toma el giro menor.
          dirX[u] = -dirX[u]!;
          dirY[u] = -dirY[u]!;
          const reverse = turnStep(graph, u, v, edge.length, dirX, dirY, turnSince, settings.corner90Db);
          dirX[u] = -dirX[u]!;
          dirY[u] = -dirY[u]!;
          if (reverse.lossDb < step.lossDb) step = reverse;
        }
        const candidate = cost + alpha[edge.gallery]! * edge.length + step.lossDb;
        if (candidate < best[v]!) {
          best[v] = candidate;
          dist[v] = dist[u]! + edge.length;
          bendCount[v] = bendCount[u]! + (step.counted ? 1 : 0);
          bendLoss[v] = bendLoss[u]! + step.lossDb;
          turnSince[v] = step.turn;
          dirX[v] = step.dx;
          dirY[v] = step.dy;
          onCable[v] = 0;
          heap.push(candidate, v);
        }
      }
    }
    const gainDb = best.map((loss) => -loss);
    mergeBoth({ gainDb, dist, bends: bendCount, bendLossDb: bendLoss }, cable.headPowerDbm, -(c + 1));
  });

  return { downlink, uplink };
}

/** Largo total de galerías (m) y largo con nivel ≥ `thresholdDbm` en ambos extremos de cada tramo. */
export function coveredLength(graph: CaveGraph, levels: Float64Array, thresholdDbm: number): { totalM: number; coveredM: number } {
  let totalM = 0;
  let coveredM = 0;
  for (let u = 0; u < graph.x.length; u++) {
    for (const edge of graph.edges[u]!) {
      if (edge.to < u) continue; // cada tramo una vez
      totalM += edge.length;
      if (levels[u]! >= thresholdDbm && levels[edge.to]! >= thresholdDbm) coveredM += edge.length;
    }
  }
  return { totalM, coveredM };
}
