import { describe, expect, it } from 'vitest';
import { destinationPoint, distanceM } from '../geo/geodesy';
import { contourRing, farthestReachM } from './contours';
import { planRadials, pointDistanceM } from './radials';

const site = { lon: -75.5663, lat: 6.2773 };
// 1 km de radio: 360 radiales y 12 puntos por radial, cada 83,33 m (36 tramos de 27,78 m, stride 3).
const plan = planRadials(site, 1000);
const n = plan.pointsPerRadial;

/** Grilla con la misma pérdida en todo el círculo, salvo lo que cambie `edit`. */
function grid(lossDb: number, edit?: (loss: Float32Array) => void) {
  const loss = new Float32Array(plan.radialCount * n).fill(lossDb);
  edit?.(loss);
  return { lossDb: loss, warnings: new Int32Array(loss.length) };
}

describe('farthestReachM', () => {
  it('el plan de 1 km tiene 360 radiales de 12 puntos', () => {
    expect([plan.radialCount, n]).toEqual([360, 12]);
  });

  // Valor = 100 − pérdida: con 30 dB de pérdida el campo es 70 dBµV/m en todas partes.
  it('si todo el radial llega, el alcance es el último punto calculado', () => {
    const reach = farthestReachM(plan, grid(30), 100, 66);
    expect(reach[0]).toBeCloseTo(pointDistanceM(plan, n - 1), 6);
    expect(reach[359]).toBeCloseTo(pointDistanceM(plan, n - 1), 6);
  });

  it('si ningún punto llega, el alcance es 0', () => {
    expect(farthestReachM(plan, grid(50), 100, 66)[90]).toBe(0);
  });

  it('radial 90 (este): llega en el punto 1, cae detrás de un cerro y vuelve en el punto 6 → alcance del punto 6', () => {
    // Pérdida 50 dB (campo 50) en todo el radial, salvo 30 dB (campo 70) en los puntos 1 y 6.
    const g = grid(30, (loss) => {
      for (let k = 0; k < n; k++) loss[90 * n + k] = k === 1 || k === 6 ? 30 : 50;
    });
    const reach = farthestReachM(plan, g, 100, 66);
    expect(reach[90]).toBeCloseTo(pointDistanceM(plan, 6), 6);
    expect(reach[89]).toBeCloseTo(pointDistanceM(plan, n - 1), 6);
  });

  it('un punto sin calcular (NaN) al final no cuenta: se toma el anterior que llega', () => {
    const g = grid(30, (loss) => (loss[n - 1] = Number.NaN));
    expect(farthestReachM(plan, g, 100, 66)[0]).toBeCloseTo(pointDistanceM(plan, n - 2), 6);
  });
});

describe('contourRing', () => {
  const ring = contourRing(plan, grid(30), 100, 66);

  it('un vértice por radial más el de cierre, igual al primero', () => {
    expect(ring).toHaveLength(361);
    expect(ring[360]).toEqual(ring[0]);
  });

  it('el vértice del radial 0 está al norte del sitio y el del radial 90 al este, a la distancia del alcance', () => {
    const d = pointDistanceM(plan, n - 1);
    expect(distanceM(ring[0]!, destinationPoint(site, 0, d))).toBeLessThan(0.01);
    expect(distanceM(ring[90]!, destinationPoint(site, 90, d))).toBeLessThan(0.01);
  });
});
