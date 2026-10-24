// Red de galerías de una mina, túnel o caverna, y propagación de la señal por ella.
// Las galerías se convierten en un grafo con un nodo cada pocos metros. Desde cada antena la
// señal avanza por el camino de menor pérdida: espacio libre hasta la distancia de quiebre,
// atenuación modal de cada galería después, y una pérdida extra en cada curva o cruce.
// El cable radiante alimenta a todos los nodos cercanos con su nivel de acople. Módulo puro.

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
  /** Ganancia de la antena del radio que recibe (dBi). */
  rxGainDbi: number;
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

/** Por debajo de este ángulo un cambio de dirección no cuenta como curva (galerías dibujadas a mano). */
const MIN_BEND_DEG = 25;

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

export interface SimulationResult {
  /** Nivel recibido en cada nodo (dBm); −Infinity si no llega nada. */
  levelDbm: Float64Array;
  /** Fuente que da el mejor nivel: índice de antena (≥ 0), −(cable + 1) para cables, o −1000 si ninguna. */
  source: Int32Array;
  /** Distancia por las galerías hasta la fuente (m). */
  pathM: Float64Array;
  /** Curvas y cruces en el camino. */
  bends: Int32Array;
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

function angleBetweenDeg(ax: number, ay: number, bx: number, by: number): number {
  const dot = ax * bx + ay * by;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

export function simulate(model: CaveModel, graph: CaveGraph, settings: RadioSettings): SimulationResult {
  const n = graph.x.length;
  const levelDbm = new Float64Array(n).fill(-Infinity);
  const source = new Int32Array(n).fill(-1000);
  const pathM = new Float64Array(n);
  const bends = new Int32Array(n);
  if (n === 0) return { levelDbm, source, pathM, bends };

  const alpha = model.galleries.map((g) =>
    galleryAttenuationDbPerM(settings.frequencyMHz, g, settings.rock, settings.polarization),
  );
  const breakpoint = model.galleries.map((g) => breakpointDistanceM(settings.frequencyMHz, g));

  // --- Antenas: camino de menor pérdida con espacio libre hasta el quiebre ---
  model.transmitters.forEach((tx, t) => {
    const start = nearestNode(graph, tx.x, tx.y);
    if (start.node < 0) return;
    const firstGallery = graph.edges[start.node]![0]?.gallery ?? 0;
    const alpha0 = alpha[firstGallery]!;
    const bp0 = breakpoint[firstGallery]!;
    const eirp = tx.powerDbm + tx.gainDbi + settings.rxGainDbi;
    const dist = new Float64Array(n).fill(Infinity);
    const modal = new Float64Array(n);
    const bendLoss = new Float64Array(n);
    const bendCount = new Int32Array(n);
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
        const dx = (graph.x[v]! - graph.x[u]!) / edge.length;
        const dy = (graph.y[v]! - graph.y[u]!) / edge.length;
        let extraBend = 0;
        let isBend = 0;
        if (dirX[u] !== 0 || dirY[u] !== 0) {
          const angle = angleBetweenDeg(dirX[u]!, dirY[u]!, dx, dy);
          if (angle > MIN_BEND_DEG) {
            extraBend = bendLossDb(angle, settings.corner90Db);
            isBend = 1;
          }
        }
        const d = dist[u]! + edge.length;
        const a = modal[u]! + alpha[edge.gallery]! * edge.length;
        const b = bendLoss[u]! + extraBend;
        const candidate = lossOf(d, a, b);
        if (candidate < best[v]!) {
          best[v] = candidate;
          dist[v] = d;
          modal[v] = a;
          bendLoss[v] = b;
          bendCount[v] = bendCount[u]! + isBend;
          dirX[v] = dx;
          dirY[v] = dy;
          heap.push(candidate, v);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const level = eirp - best[i]!;
      if (level > levelDbm[i]!) {
        levelDbm[i] = level;
        source[i] = t;
        pathM[i] = dist[i]!;
        bends[i] = bendCount[i]!;
      }
    }
  });

  // --- Cables radiantes: alimentan los nodos cercanos y de ahí se propaga por las galerías ---
  model.cables.forEach((cable, c) => {
    const seed = new Float64Array(n).fill(-Infinity);
    let along = 0;
    for (let i = 0; i < cable.points.length - 1; i++) {
      const p = cable.points[i]!;
      const q = cable.points[i + 1]!;
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      const steps = Math.max(1, Math.ceil(length / NODE_STEP_M));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = p.x + (q.x - p.x) * t;
        const cy = p.y + (q.y - p.y) * t;
        for (let k = 0; k < n; k++) {
          const r = Math.hypot(graph.x[k]! - cx, graph.y[k]! - cy);
          if (r > 8) continue; // solo los nodos de la galería por donde va el cable
          const level = leakyCableLevelDbm(cable.headPowerDbm, settings.cable, along + length * t, r) + settings.rxGainDbi;
          if (level > seed[k]!) seed[k] = level;
        }
      }
      along += length;
    }
    // Dijkstra sobre la pérdida desde el nivel de acople de cada nodo sembrado.
    const best = new Float64Array(n).fill(Infinity);
    const dist = new Float64Array(n);
    const bendCount = new Int32Array(n);
    const dirX = new Float64Array(n);
    const dirY = new Float64Array(n);
    const heap = new MinHeap();
    for (let k = 0; k < n; k++) {
      if (seed[k] === -Infinity) continue;
      best[k] = -seed[k]!;
      heap.push(best[k]!, k);
    }
    while (heap.size) {
      const [cost, u] = heap.pop();
      if (cost > best[u]!) continue;
      for (const edge of graph.edges[u]!) {
        const v = edge.to;
        const dx = (graph.x[v]! - graph.x[u]!) / edge.length;
        const dy = (graph.y[v]! - graph.y[u]!) / edge.length;
        let extra = 0;
        let isBend = 0;
        if (dirX[u] !== 0 || dirY[u] !== 0) {
          const angle = angleBetweenDeg(dirX[u]!, dirY[u]!, dx, dy);
          if (angle > MIN_BEND_DEG) {
            extra = bendLossDb(angle, settings.corner90Db);
            isBend = 1;
          }
        }
        const candidate = cost + alpha[edge.gallery]! * edge.length + extra;
        if (candidate < best[v]!) {
          best[v] = candidate;
          dist[v] = dist[u]! + edge.length;
          bendCount[v] = bendCount[u]! + isBend;
          dirX[v] = dx;
          dirY[v] = dy;
          heap.push(candidate, v);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const level = -best[i]!;
      if (level > levelDbm[i]!) {
        levelDbm[i] = level;
        source[i] = -(c + 1);
        pathM[i] = dist[i]!;
        bends[i] = bendCount[i]!;
      }
    }
  });

  return { levelDbm, source, pathM, bends };
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
