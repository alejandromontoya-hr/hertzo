import { describe, expect, it } from 'vitest';
import { areaAboveKm2, gridValues, lowConfidencePixels, pixelAreaKm2 } from './pixelValues';
import type { RasterGeometry } from './raster';

const geometry: RasterGeometry = {
  width: 3,
  height: 1,
  coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]],
  index: Int32Array.from([0, 1, -1]),
  bearingDeg: Float32Array.from([0, 90, 0]),
  distanceM: new Float32Array(3),
};
const grid = { lossDb: Float32Array.from([120, 140]), warnings: Int32Array.from([0, 0x80]) };

describe('gridValues', () => {
  it('PIRE 62,15 dBm − 120 dB = −57,85; − 140 dB = −77,85; fuera del círculo NaN', () => {
    const out = new Float32Array(3);
    gridValues(geometry, grid, 62.15, out);
    expect(out[0]).toBeCloseTo(-57.85, 4);
    expect(out[1]).toBeCloseTo(-77.85, 4);
    expect(Number.isNaN(out[2])).toBe(true);
  });

  it('suma la ganancia del píxel (patrón de antena): −3 dB hacia el este', () => {
    const out = new Float32Array(3);
    gridValues(geometry, grid, 0, out, (p) => (geometry.bearingDeg[p] === 90 ? -3 : 0));
    expect(out[1]).toBeCloseTo(-143, 4);
  });
});

describe('lowConfidencePixels', () => {
  it('solo el píxel cuya grilla tiene la bandera 0x80', () => {
    const out = new Uint8Array(3);
    lowConfidencePixels(geometry, [grid], 0x80, out);
    expect(Array.from(out)).toEqual([0, 1, 0]);
  });
});

describe('áreas', () => {
  it('50 km de radio en 1000 px: cada píxel mide 0,1 × 0,1 km = 0,01 km²', () => {
    expect(pixelAreaKm2({ ...geometry, width: 1000 }, 50000)).toBeCloseTo(0.01, 10);
  });

  it('valores 80, 70, 60: ≥74 un píxel, ≥66 dos, ≥54 tres', () => {
    expect(areaAboveKm2(Float32Array.from([80, 70, 60, Number.NaN]), [54, 74, 66], 0.01)).toEqual([0.01, 0.02, 0.03]);
  });
});
