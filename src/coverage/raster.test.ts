import { describe, expect, it } from 'vitest';
import { destinationPoint } from '../geo/geodesy';
import { talkInBudget, talkOutBudget, type RadioProfile, type SiteRxChain, type SiteTxChain } from '../rf/linkBudget';
import { planRadials } from './radials';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from './raster';
import { renderCoverage } from './render';

const site = { lon: -75.6853, lat: 6.2794 };

describe('gridIndexAt', () => {
  // 10 km: 360 radiales y 112 puntos cada 89,29 m (336 tramos de 29,762 m, stride 3).
  const plan = planRadials(site, 10000);

  it('5 km al este: radial 90 (uno por grado), punto round(5000 / 89,29) − 1 = 55', () => {
    expect(gridIndexAt(plan, destinationPoint(site, 90, 5000))).toBe(90 * 112 + 55);
  });

  it('justo en el sitio usa el primer punto del radial 0', () => {
    expect(gridIndexAt(plan, site)).toBe(0);
  });

  it('a 10,5 km queda fuera del radio: −1', () => {
    expect(gridIndexAt(plan, destinationPoint(site, 200, 10500))).toBe(-1);
  });

  it('el rumbo 359,8° redondea al radial 0, no al 360', () => {
    expect(gridIndexAt(plan, destinationPoint(site, 359.8, 3000))).toBe(0 * 112 + Math.round(3000 / (3 * plan.stepM)) - 1);
  });
});

describe('buildRasterGeometry', () => {
  // 1 km de radio con píxeles de 100 m: imagen de 20 × 20.
  const plan = planRadials(site, 1000);
  const g = buildRasterGeometry(plan);

  it('1 km de radio: imagen de 20 × 20 píxeles', () => {
    expect(g.width).toBe(20);
    expect(g.height).toBe(20);
  });

  it('las esquinas quedan fuera del círculo y el centro dentro', () => {
    expect(g.index[0]).toBe(-1);
    expect(g.index[19]).toBe(-1);
    expect(g.index[10 * 20 + 10]).toBeGreaterThanOrEqual(0);
  });

  it('50 km: píxeles de 100 m, imagen de 1000 × 1000', () => {
    expect(buildRasterGeometry(planRadials(site, 50000)).width).toBe(1000);
  });

  // Sitio a 45° N con 50 km de radio: 1000 × 1000 píxeles y el sitio entre las filas 499 y 500.
  // En grados parejos (Google Earth) la fila del medio es la latitud del sitio; en Mercator el
  // norte se estira y la mitad de la imagen queda unos 200 m al norte del sitio.
  const north45 = planRadials({ lon: -75, lat: 45 }, 50000);
  const sideBySide = (g: RasterGeometry) => [g.distanceM[499 * 1000 + 499]!, g.distanceM[500 * 1000 + 499]!] as const;

  it('en grados parejos, los píxeles justo al norte y al sur del sitio están a la misma distancia', () => {
    const [above, below] = sideBySide(buildRasterGeometry(north45, 'geographic'));
    expect(Math.abs(above - below)).toBeLessThan(1);
  });

  it('en Mercator esos dos píxeles quedan a distancias que difieren en más de 50 m', () => {
    const [above, below] = sideBySide(buildRasterGeometry(north45));
    expect(Math.abs(above - below)).toBeGreaterThan(50);
  });

  it('las dos cuadrículas cubren el mismo rectángulo', () => {
    expect(buildRasterGeometry(north45, 'geographic').coordinates).toEqual(buildRasterGeometry(north45).coordinates);
  });
});

describe('renderCoverage', () => {
  const tx: SiteTxChain = {
    frequencyMHz: 860, transmitterPowerW: 100, combinerLossDb: 2, lineLengthM: 60, lineLossDbPer100m: 4,
    connectorLossDb: 1, antennaGainDbd: 6, antennaHeightM: 50,
  };
  const rx: SiteRxChain = {
    frequencyMHz: 815, antennaGainDbd: 6, antennaHeightM: 50, towerAmplifierGainDb: 0, lineLengthM: 60,
    lineLossDbPer100m: 4, multicouplerLossDb: 3, receiverSensitivityDbm: -119,
  };
  const radio: RadioProfile = {
    id: 'prueba', name: 'Prueba', powerW: 3, antennaGainDbd: 0, heightM: 1.5, bodyLossDb: 10, sensitivityDbm: -116,
  };
  // Del balance de las pruebas de linkBudget: con 150 dB de trayecto llegan −105,1 dBm de
  // bajada (+10,9 dB) y −120,33 dBm de subida (−1,33 dB).
  const down = talkOutBudget(tx, radio);
  const up = talkInBudget(rx, radio);

  // Imagen de 3 píxeles: grilla 0 (150 dB), grilla 1 (140 dB, con advertencia 0x0080) y fuera del círculo.
  const geometry: RasterGeometry = {
    width: 3,
    height: 1,
    coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]],
    index: Int32Array.from([0, 1, -1]),
    bearingDeg: new Float32Array(3),
    distanceM: new Float32Array(3),
  };
  const grids = {
    talkOut: { lossDb: Float32Array.from([150, 140]), warnings: Int32Array.from([0, 0x0080]) },
    talkIn: { lossDb: Float32Array.from([150, 140]), warnings: Int32Array.from([0, 0]) },
  };
  const paint = (view: 'talkOut' | 'talkIn' | 'balance') => {
    const out = new Uint8ClampedArray(12);
    renderCoverage(geometry, grids, view, down, up, [-80, -95, -105], out);
    return out;
  };

  it('bajada con −105,1 dBm: franja 3 (−116 a −105), rojo #d73027', () => {
    expect(Array.from(paint('talkOut').slice(0, 4))).toEqual([0xd7, 0x30, 0x27, 255]);
  });

  it('subida con −120,33 dBm no llega a −119 dBm: transparente', () => {
    expect(paint('talkIn')[3]).toBe(0);
  });

  it('desbalance con 150 dB: solo bajada, naranja #d95f0e', () => {
    expect(Array.from(paint('balance').slice(0, 4))).toEqual([0xd9, 0x5f, 0x0e, 255]);
  });

  it('el píxel con advertencia 0x0080 cae en una diagonal del rayado: gris oscuro', () => {
    // Píxel (fila 0, columna 1): (0 + 1) % 6 = 1 < 2 → rayado.
    expect(Array.from(paint('talkOut').slice(4, 8))).toEqual([55, 55, 55, 255]);
  });

  it('fuera del círculo: transparente', () => {
    expect(paint('talkOut')[11]).toBe(0);
  });
});
