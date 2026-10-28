import { describe, expect, it } from 'vitest';
import { buildGraph, coveredLength, nearestNode, simulate, type CaveModel, type RadioSettings } from './network';

const settings = (frequencyMHz: number, cable = { longitudinalDbPer100m: 3.6, couplingLossDb: 70 }): RadioSettings => ({
  frequencyMHz,
  polarization: 'vertical',
  rock: { epsilonR: 5, roughnessM: 0 },
  corner90Db: 15 + 10 * Math.log10(frequencyMHz / 100),
  rxGainDbi: 0,
  cable,
});

const gallery = (id: string, points: [number, number][]) => ({
  id,
  name: id,
  points: points.map(([x, y]) => ({ x, y })),
  widthM: 4.3,
  heightM: 4.3,
});

const tx = { id: 't', name: 'Repetidor', x: 0, y: 0, powerDbm: 30, gainDbi: 0 };

describe('grafo de galerías', () => {
  it('una galería de 10 m con nodos cada 2 m: 6 nodos y 5 tramos', () => {
    const graph = buildGraph([gallery('a', [[0, 0], [10, 0]])]);
    expect(graph.x.length).toBe(6);
    expect(graph.edges.reduce((sum, e) => sum + e.length, 0) / 2).toBe(5);
  });

  it('dos galerías que comparten un vértice quedan unidas en ese nodo', () => {
    const graph = buildGraph([gallery('a', [[0, 0], [100, 0]]), gallery('b', [[100, 0], [100, -50]])]);
    const junction = nearestNode(graph, 100, 0).node;
    // El vértice (100, 0) es el final de "a" y el inicio de "b": un nodo con 2 tramos (uno de cada galería).
    expect(graph.edges[junction]!.length).toBe(2);
    expect(graph.edges[junction]!.map((e) => e.gallery).sort()).toEqual([0, 1]);
  });
});

describe('propagación desde una antena', () => {
  // 900 MHz en galería de 4,3 m sin rugosidad: α = 0,018183 dB/m; quiebre a 55,51 m.
  // A 500 m: espacio libre a 55,51 m (66,423 dB) + 0,018183·444,49 (8,082 dB) = 74,505 dB → 30 − 74,505 = −44,5 dBm.
  it('galería recta de 500 m a 900 MHz: −44,5 dBm al fondo', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [500, 0]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    const end = nearestNode(graph, 500, 0).node;
    expect(r.levelDbm[end]).toBeCloseTo(-44.5, 1);
    expect(r.pathM[end]).toBeCloseTo(500, 6);
    expect(r.bends[end]).toBe(0);
  });

  // En L: 100 m, curva de 90° (24,54 dB a 900 MHz) y otros 100 m:
  // 66,423 + 0,018183·(200 − 55,51) + 24,542 = 66,423 + 2,627 + 24,542 = 93,59 dB → −63,6 dBm.
  it('galería en L de 2 × 100 m: una curva y −63,6 dBm al final', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [100, 0], [100, 100]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    const end = nearestNode(graph, 100, 100).node;
    expect(r.bends[end]).toBe(1);
    expect(r.levelDbm[end]).toBeCloseTo(-63.6, 1);
  });

  it('FM (100 MHz) en la misma galería recta casi no llega: más de 600 dB de pérdida a 500 m', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [500, 0]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100));
    expect(r.levelDbm[nearestNode(graph, 500, 0).node]!).toBeLessThan(-600);
  });
});

describe('cable radiante', () => {
  // FM con cable de 1,5 dB/100 m y acople de 60 dB a 2 m, alimentado con 30 dBm:
  // a 300 m de la cabecera, sobre el eje del cable: 30 − 4,5 − 60 = −34,5 dBm; a 100 m, −31,5 dBm.
  it('FM con cable a lo largo de 300 m: −31,5 dBm a 100 m y −34,5 dBm a 300 m', () => {
    const model: CaveModel = {
      galleries: [gallery('a', [[0, 0], [300, 0]])],
      transmitters: [],
      cables: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], headPowerDbm: 30 }],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100, { longitudinalDbPer100m: 1.5, couplingLossDb: 60 }));
    expect(r.levelDbm[nearestNode(graph, 100, 0).node]).toBeCloseTo(-31.5, 1);
    expect(r.levelDbm[nearestNode(graph, 300, 0).node]).toBeCloseTo(-34.5, 1);
    expect(r.source[0]).toBe(-1);
  });

  it('largo cubierto: con umbral de −40 dBm, los 300 m quedan cubiertos', () => {
    const model: CaveModel = {
      galleries: [gallery('a', [[0, 0], [300, 0]])],
      transmitters: [],
      cables: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], headPowerDbm: 30 }],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100, { longitudinalDbPer100m: 1.5, couplingLossDb: 60 }));
    const { totalM, coveredM } = coveredLength(graph, r.levelDbm, -40);
    expect(totalM).toBeCloseTo(300, 6);
    expect(coveredM).toBeCloseTo(300, 6);
  });
});
