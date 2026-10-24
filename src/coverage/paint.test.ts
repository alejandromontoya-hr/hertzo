import { describe, expect, it } from 'vitest';
import { bandLabels, paintBands, paintCategories } from './paint';

const colors = ['#ff0000', '#00ff00', '#0000ff'];

describe('paintBands (umbrales 74, 66 y 54)', () => {
  // 4 píxeles en una fila: 80, 70, 60 y 40 dBµV/m.
  const values = Float32Array.from([80, 70, 60, 40]);
  const out = new Uint8ClampedArray(16);
  paintBands({ width: 4, height: 1 }, values, [54, 74, 66], colors, null, out);

  it('80 ≥ 74: rojo', () => expect(Array.from(out.slice(0, 4))).toEqual([255, 0, 0, 255]));
  it('70 entre 66 y 74: verde', () => expect(Array.from(out.slice(4, 8))).toEqual([0, 255, 0, 255]));
  it('60 entre 54 y 66: azul', () => expect(Array.from(out.slice(8, 12))).toEqual([0, 0, 255, 255]));
  it('40 < 54: transparente', () => expect(out[15]).toBe(0));

  it('NaN no se pinta', () => {
    const o = new Uint8ClampedArray(4);
    paintBands({ width: 1, height: 1 }, Float32Array.from([Number.NaN]), [54], colors, null, o);
    expect(o[3]).toBe(0);
  });

  it('con baja confianza, las diagonales del rayado van en gris oscuro', () => {
    const o = new Uint8ClampedArray(8);
    // Píxel (0,1): (0 + 1) % 6 = 1 < 2 → rayado; píxel (0,0) también (0 % 6 = 0).
    paintBands({ width: 2, height: 1 }, Float32Array.from([80, 80]), [54], colors, Uint8Array.from([0, 1]), o);
    expect(Array.from(o.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(o.slice(4, 8))).toEqual([55, 55, 55, 255]);
  });
});

describe('paintCategories', () => {
  it('categoría 2 → azul, −1 → transparente', () => {
    const o = new Uint8ClampedArray(8);
    paintCategories({ width: 2, height: 1 }, Int16Array.from([2, -1]), colors, null, o);
    expect(Array.from(o.slice(0, 4))).toEqual([0, 0, 255, 255]);
    expect(o[7]).toBe(0);
  });
});

describe('bandLabels', () => {
  it('franjas de FM en dBµV/m', () => {
    expect(bandLabels([54, 74, 66], 'dBµV/m')).toEqual(['≥ 74 dBµV/m', '66 a 74 dBµV/m', '54 a 66 dBµV/m']);
  });
});
