import { describe, expect, it } from 'vitest';
import { withClutter } from './clutterEngine';
import type { PropagationEngine, RadialRequest } from './engine';

/** Motor de prueba: devuelve 100 dB en cada punto y guarda las alturas que recibió. */
function fakeEngine() {
  const seen: RadialRequest[] = [];
  const engine: PropagationEngine = {
    id: 'fake',
    name: 'Prueba',
    radialLoss(r) {
      seen.push(r);
      return { lossDb: new Float32Array([100, 100, Number.NaN]), warnings: new Int32Array(3) };
    },
  };
  return { engine, seen };
}

const request: RadialRequest = { elevationsM: new Float32Array(10), stepM: 30, txHeightM: 30, rxHeightM: 2, frequencyMHz: 916.8, stride: 3 };

describe('withClutter', () => {
  it('urbano de 15 m: el equipo a 2 m se calcula a 15 m y suma 22,35 dB; el sitio a 30 m no suma', () => {
    const { engine, seen } = fakeEngine();
    const result = withClutter(engine, { type: 'urbano', heightM: 15 }).radialLoss(request);
    expect(seen[0]!.rxHeightM).toBe(15);
    expect(seen[0]!.txHeightM).toBe(30);
    expect(result.lossDb[0]).toBeCloseTo(122.35, 2);
  });

  it('urbano denso de 20 m con el sitio a 15 m: suma en los dos extremos', () => {
    const { engine, seen } = fakeEngine();
    // Sitio a 15 m: Δh = 5, θ = atan(5/27) = 10,49°, ν = 0,32746·√(5·10,49) = 2,372 → J − 6,03 = 14,41 dB.
    // Equipo a 2 m: 24,95 dB. Total 100 + 14,41 + 24,95 = 139,36 dB.
    const result = withClutter(engine, { type: 'urbano-denso', heightM: 20 }).radialLoss({ ...request, txHeightM: 15 });
    expect(seen[0]!.txHeightM).toBe(20);
    expect(result.lossDb[1]).toBeCloseTo(139.36, 1);
  });

  it('donde el motor no calculó (NaN) sigue sin cálculo', () => {
    const { engine } = fakeEngine();
    const result = withClutter(engine, { type: 'urbano', heightM: 15 }).radialLoss(request);
    expect(Number.isNaN(result.lossDb[2])).toBe(true);
  });
});
