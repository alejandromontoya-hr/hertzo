import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ItmError, Polarization, RadioClimate, createItmEngine, loadItm, type Itm, type ItmParameters } from './itm';

// Casos de prueba oficiales de NTIA (engine/itm/test-data), con el resultado que publica NTIA.
const testData = join(process.cwd(), 'engine/itm/test-data');
const csvRows = (file: string) =>
  readFileSync(join(testData, file), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map(Number));

let itm: Itm;
beforeAll(async () => {
  itm = await loadItm();
});

describe('ITM de NTIA compilado a WebAssembly', () => {
  // cmd_examples de NTIA: 15 m → 3 m, 3500 MHz, clima continental templado, perfil pfl.txt.
  // Resultado publicado (o_p2ptls.txt): 114,5 dB, línea de vista, sin advertencias.
  it('ejemplo de NTIA con pfl.txt: 114,5 dB', () => {
    const pfl = readFileSync(join(testData, 'pfl.txt'), 'utf8').trim().split(',').map(Number);
    const params: ItmParameters = {
      climate: RadioClimate.ContinentalTemperate,
      refractivityN0: 301,
      polarization: Polarization.Vertical,
      groundPermittivity: 15,
      groundConductivitySm: 0.005,
      variabilityMode: 1,
      timePct: 50,
      locationPct: 50,
      situationPct: 50,
    };
    const result = itm.pointToPoint(pfl, 15, 3, 3500, params);
    expect(result.lossDb).toBeCloseTo(114.5, 1);
    expect(result.warnings).toBe(0);
  });

  // p2p.csv trae una fila de parámetros por cada perfil de pfls.csv y la pérdida esperada (A__db).
  const cases = csvRows('p2p.csv').slice(1);
  const profiles = csvRows('pfls.csv');

  it.each(cases.map((row, i) => [i + 1, row] as const))(
    'caso oficial %i de p2p.csv coincide con NTIA (±0,01 dB)',
    (i, row) => {
      const [hTx, hRx, eps, sigma, n0, f, pol, climate, time, location, situation, mdvar, expected] = row;
      const result = itm.pointToPoint(profiles[i - 1]!, hTx!, hRx!, f!, {
        climate: climate!,
        refractivityN0: n0!,
        polarization: pol!,
        groundPermittivity: eps!,
        groundConductivitySm: sigma!,
        variabilityMode: mdvar!,
        timePct: time!,
        locationPct: location!,
        situationPct: situation!,
      });
      expect(Math.abs(result.lossDb - expected!)).toBeLessThan(0.01);
    },
  );

  it('altura de antena fuera de rango: error en español', () => {
    expect(() => itm.pointToPoint([2, 100, 0, 0, 0], 0.1, 2, 860)).toThrow(ItmError);
    expect(() => itm.pointToPoint([2, 100, 0, 0, 0], 0.1, 2, 860)).toThrow(
      'La altura de la antena transmisora está fuera de rango',
    );
  });
});

describe('radial', () => {
  // Perfil de 101 muestras cada 100 m (10 km): una loma de 300 m a mitad de camino.
  const elevationsM = Float32Array.from({ length: 101 }, (_, i) => 1500 + 300 * Math.exp(-(((i - 50) / 8) ** 2)));
  const request = { elevationsM, stepM: 100, txHeightM: 30, rxHeightM: 1.5, frequencyMHz: 860, stride: 5 };

  it('stride 5 sobre 100 tramos: 20 puntos (500 m, 1000 m, …, 10 km)', () => {
    expect(itm.radial(request).length).toBe(20);
  });

  it('cada punto del radial coincide con el cálculo punto a punto hasta ese punto', () => {
    const losses = itm.radial(request);
    for (const k of [0, 9, 19]) {
      const samples = (k + 1) * 5;
      const pfl = [samples, 100, ...elevationsM.slice(0, samples + 1)];
      const p2p = itm.pointToPoint(pfl, 30, 1.5, 860);
      expect(losses[k]).toBeCloseTo(p2p.lossDb, 3);
    }
  });

  it('detrás de la loma la pérdida es mayor que justo antes', () => {
    const losses = itm.radial(request);
    // Punto 8 → muestra 45 (4,5 km, ladera de subida); punto 13 → muestra 70 (7 km, sombra).
    expect(losses[13]!).toBeGreaterThan(losses[8]! + 10);
  });

  it('el motor común (PropagationEngine) entrega lo mismo que el radial directo', async () => {
    const engine = await createItmEngine();
    expect(engine.id).toBe('itm');
    expect(Array.from(engine.radialLoss(request))).toEqual(Array.from(itm.radial(request)));
  });
});
