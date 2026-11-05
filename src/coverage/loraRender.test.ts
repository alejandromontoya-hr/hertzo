import { describe, expect, it } from 'vitest';
import { DEFAULT_LORA_GATEWAY, LORA_BANDS, LORA_SENSORS, gatewayRxChain, sensorRadioProfile } from '../data/lora';
import { talkInBudget } from '../rf/linkBudget';
import { hexToRgb } from './colorScale';
import { SF_COLORS, renderSpreadingFactor } from './loraRender';
import type { RasterGeometry } from './raster';

// Sensor en poste, AU915: nivel en el gateway = 22,15 + 5,15 − 1,78 − pérdida = 25,52 − pérdida.
// Gateway con NF 4 dB a 125 kHz: SF7 −126,53; SF9 −131,53; SF10 −134,03; SF12 −139,03 dBm.
const au915 = LORA_BANDS.find((b) => b.id === 'au915')!;
const poste = LORA_SENSORS.find((s) => s.id === 'poste')!;
const budget = talkInBudget(gatewayRxChain(au915, DEFAULT_LORA_GATEWAY), sensorRadioProfile(au915, poste));

const geometry = { width: 4, height: 1, index: Int32Array.from([0, 1, 2, -1]) } as RasterGeometry;
const grid = { lossDb: Float32Array.from([150, 158, 170]), warnings: new Int32Array(3) };

describe('renderSpreadingFactor', () => {
  const out = new Uint8ClampedArray(16);
  renderSpreadingFactor(geometry, grid, budget, 125, DEFAULT_LORA_GATEWAY.noiseFigureDb, out);
  const pixel = (i: number) => Array.from(out.slice(i * 4, i * 4 + 4));

  it('150 dB → −124,48 dBm: alcanza SF7 (verde)', () => {
    expect(pixel(0)).toEqual([...hexToRgb(SF_COLORS[7]), 255]);
  });

  it('158 dB → −132,48 dBm: SF9 no alcanza (−131,53), SF10 sí', () => {
    expect(pixel(1)).toEqual([...hexToRgb(SF_COLORS[10]), 255]);
  });

  it('170 dB → −144,48 dBm: no llega ni con SF12, transparente', () => {
    expect(pixel(2)[3]).toBe(0);
  });

  it('fuera del círculo de cálculo: transparente', () => {
    expect(pixel(3)[3]).toBe(0);
  });
});
