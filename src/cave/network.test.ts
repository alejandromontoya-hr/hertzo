import { describe, expect, it } from 'vitest';
import { buildGraph, coveredLength, nearestNode, simulate, type CaveModel, type RadioSettings } from './network';

// Sin inclinación ni rugosidad, para que las cuentas a mano queden solo con la atenuación modal.
const settings = (
  frequencyMHz: number,
  cable = { longitudinalDbPer100m: 3.6, couplingLossDb: 70 },
  portablePowerDbm: number | null = 36,
): RadioSettings => ({
  frequencyMHz,
  polarization: 'vertical',
  rock: { epsilonR: 5, roughnessM: 0, tiltDeg: 0 },
  corner90Db: 15 + 10 * Math.log10(frequencyMHz / 100),
  rxGainDbi: 0,
  portablePowerDbm,
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
    expect(r.downlink.levelDbm[end]).toBeCloseTo(-44.5, 1);
    expect(r.downlink.pathM[end]).toBeCloseTo(500, 6);
    expect(r.downlink.bends[end]).toBe(0);
  });

  // En L: 100 m, curva de 90° (24,54 dB a 900 MHz) y otros 100 m:
  // 66,423 + 0,018183·(200 − 55,51) + 24,542 = 66,423 + 2,627 + 24,542 = 93,59 dB → −63,6 dBm.
  it('galería en L de 2 × 100 m: una curva y −63,6 dBm al final', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [100, 0], [100, 100]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    const end = nearestNode(graph, 100, 100).node;
    expect(r.downlink.bends[end]).toBe(1);
    expect(r.downlink.levelDbm[end]).toBeCloseTo(-63.6, 1);
  });

  it('FM (100 MHz) en la misma galería recta casi no llega: más de 600 dB de pérdida a 500 m', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [500, 0]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100));
    expect(r.downlink.levelDbm[nearestNode(graph, 500, 0).node]!).toBeLessThan(-600);
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
    expect(r.downlink.levelDbm[nearestNode(graph, 100, 0).node]).toBeCloseTo(-31.5, 1);
    expect(r.downlink.levelDbm[nearestNode(graph, 300, 0).node]).toBeCloseTo(-34.5, 1);
    expect(r.downlink.source[0]).toBe(-1);
  });

  it('largo cubierto: con umbral de −40 dBm, los 300 m quedan cubiertos', () => {
    const model: CaveModel = {
      galleries: [gallery('a', [[0, 0], [300, 0]])],
      transmitters: [],
      cables: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], headPowerDbm: 30 }],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100, { longitudinalDbPer100m: 1.5, couplingLossDb: 60 }));
    const { totalM, coveredM } = coveredLength(graph, r.downlink.levelDbm, -40);
    expect(totalM).toBeCloseTo(300, 6);
    expect(coveredM).toBeCloseTo(300, 6);
  });
});

describe('subida (talk-in)', () => {
  // Mismo camino que la bajada a 500 m (74,505 dB). Subida: el portátil transmite con 36 dBm (4 W)
  // y el repetidor (0 dBi) recibe 36 − 74,505 = −38,5 dBm. Bajada: 30 − 74,505 = −44,5 dBm.
  it('galería recta de 500 m a 900 MHz: el repetidor recibe −38,5 dBm del portátil de 36 dBm', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [500, 0]])], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    const end = nearestNode(graph, 500, 0).node;
    expect(r.uplink!.levelDbm[end]).toBeCloseTo(-38.5, 1);
    expect(r.uplink!.levelDbm[end]! - r.downlink.levelDbm[end]!).toBeCloseTo(6, 10);
  });

  // Cable FM de 1,5 dB/100 m y 60 dB de acople. El portátil de 36 dBm a 300 m de la cabecera:
  // 36 − 60 (acople) − 4,5 (300 m de cable) = −28,5 dBm en la cabecera. La potencia de la cabecera no cuenta.
  it('cable radiante: el portátil a 300 m entrega 36 − 60 − 4,5 = −28,5 dBm en la cabecera', () => {
    const model: CaveModel = {
      galleries: [gallery('a', [[0, 0], [300, 0]])],
      transmitters: [],
      cables: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], headPowerDbm: 30 }],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(100, { longitudinalDbPer100m: 1.5, couplingLossDb: 60 }));
    expect(r.uplink!.levelDbm[nearestNode(graph, 300, 0).node]).toBeCloseTo(-28.5, 1);
  });

  it('sin potencia de portátil (AM o FM, solo recepción) no hay subida', () => {
    const model: CaveModel = { galleries: [gallery('a', [[0, 0], [100, 0]])], transmitters: [tx], cables: [] };
    const r = simulate(model, buildGraph(model.galleries), settings(100, undefined, null));
    expect(r.uplink).toBeNull();
  });
});

describe('curvas sin salto de umbral', () => {
  const corner900 = 15 + 10 * Math.log10(9); // 24,542 dB

  /** Pérdida por curvas al final de una galería de dos tramos de 100 m que gira `deg` grados. */
  const bendAt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const model: CaveModel = {
      galleries: [gallery('a', [[0, 0], [100, 0], [100 + 100 * Math.cos(rad), 100 * Math.sin(rad)]])],
      transmitters: [tx],
      cables: [],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    return r.downlink.bendLossDb[nearestNode(graph, 100 + 100 * Math.cos(rad), 100 * Math.sin(rad)).node]!;
  };

  // Proporcional al ángulo: 24/90·24,542 = 6,545 dB y 26/90·24,542 = 7,090 dB (antes: 0 y 6,2 dB).
  it('un giro de 24° pierde 6,54 dB y uno de 26°, 7,09 dB', () => {
    expect(bendAt(24)).toBeCloseTo(6.545, 2);
    expect(bendAt(26)).toBeCloseTo(7.09, 2);
  });

  // Cinco giros de 18° (90° en total), con tramos de 20 m: 5·18/90·24,542 = 24,54 dB, igual que un codo de 90°.
  it('una curva suave de 5 giros de 18° pierde lo mismo que un codo de 90°: 24,54 dB', () => {
    const points: [number, number][] = [[0, 0]];
    let heading = 0;
    for (let i = 0; i < 6; i++) {
      const [x, y] = points[points.length - 1]!;
      points.push([x + 20 * Math.cos(heading), y + 20 * Math.sin(heading)]);
      heading += (18 * Math.PI) / 180;
    }
    const model: CaveModel = { galleries: [gallery('a', points)], transmitters: [tx], cables: [] };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, settings(900));
    const [ex, ey] = points[points.length - 1]!;
    const end = nearestNode(graph, ex, ey).node;
    expect(r.downlink.bendLossDb[end]).toBeCloseTo(corner900, 2);
    // Giros de 18° acumulados: la curva se cuenta cuando pasan de 25° (en el 2.º y el 4.º giro).
    expect(r.downlink.bends[end]).toBe(2);
  });
});

describe('alcance en una galería recta de 5 × 4 m (εr 5, rugosidad 10 cm, inclinación 1°)', () => {
  const rock = { epsilonR: 5, roughnessM: 0.1, tiltDeg: 1 };
  const reach = (frequencyMHz: number, powerDbm: number, sensitivityDbm: number) => {
    const model: CaveModel = {
      galleries: [{ id: 'g', name: 'g', points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], widthM: 5, heightM: 4 }],
      transmitters: [{ ...tx, powerDbm }],
      cables: [],
    };
    const graph = buildGraph(model.galleries);
    const r = simulate(model, graph, { ...settings(frequencyMHz), rock });
    return coveredLength(graph, r.downlink.levelDbm, sensitivityDbm).coveredM;
  };

  // 2437 MHz: quiebre 25/0,12302 = 203,2 m con 86,35 dB de espacio libre; α = 0,1093 dB/m
  // (modal 0,0028 + rugosidad 0,0003 + inclinación 0,1061). 203,2 + (20 + 80 − 86,35)/0,1093 = 328,2 m.
  it('WiFi 2,4 GHz, 20 dBm y −80 dBm: 328 m (sin inclinación eran 4,58 km)', () => {
    expect(reach(2437, 20, -80)).toBeGreaterThan(324);
    expect(reach(2437, 20, -80)).toBeLessThan(330);
  });

  // 900 MHz: quiebre 75,05 m con 69,04 dB; α = 0,06074 dB/m. 75,05 + (37 + 116 − 69,04)/0,06074 = 1457,4 m.
  it('900 MHz, 5 W y −116 dBm: 1,46 km (sin inclinación eran 3,97 km)', () => {
    expect(reach(900, 37, -116)).toBeGreaterThan(1452);
    expect(reach(900, 37, -116)).toBeLessThan(1460);
  });
});
