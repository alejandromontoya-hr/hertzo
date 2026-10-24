import { describe, expect, it } from 'vitest';
import { bilinear, decodeTerrarium, lonLatToWorldPixel, terrariumTileUrl } from './tiles';

describe('decodeTerrarium', () => {
  it('128,0,0 es el nivel del mar (32768 − 32768 = 0 m)', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
  });

  it('140,28,0 son 3100 m (140·256 + 28 − 32768)', () => {
    expect(decodeTerrarium(140, 28, 0)).toBe(3100);
  });

  it('el canal azul aporta fracciones de metro (128 / 256 = 0,5 m)', () => {
    expect(decodeTerrarium(128, 100, 128)).toBe(100.5);
  });

  it('valores bajo el nivel del mar (127,255,0 = −1 m)', () => {
    expect(decodeTerrarium(127, 255, 0)).toBe(-1);
  });
});

describe('lonLatToWorldPixel', () => {
  it('lon −180 y ecuador en zoom 0: borde izquierdo, mitad vertical', () => {
    const p = lonLatToWorldPixel(-180, 0, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(128, 9);
  });

  it('lon 0 y ecuador en zoom 1: centro del mundo (256, 256)', () => {
    const p = lonLatToWorldPixel(0, 0, 1);
    expect(p.x).toBeCloseTo(256, 9);
    expect(p.y).toBeCloseTo(256, 9);
  });

  it('lon 90 en zoom 0: tres cuartos del ancho (192 px)', () => {
    expect(lonLatToWorldPixel(90, 0, 0).x).toBeCloseTo(192, 9);
  });

  it('latitud 85,0511° (límite de Web Mercator) en zoom 0: borde superior', () => {
    expect(lonLatToWorldPixel(0, 85.0511287798, 0).y).toBeCloseTo(0, 4);
  });

  it('el hemisferio norte queda arriba del ecuador', () => {
    expect(lonLatToWorldPixel(-75.58, 6.24, 12).y).toBeLessThan(lonLatToWorldPixel(-75.58, 0, 12).y);
  });
});

describe('terrariumTileUrl', () => {
  it('arma la URL de AWS Terrain Tiles', () => {
    expect(terrariumTileUrl(12, 1188, 1976)).toBe(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1188/1976.png',
    );
  });
});

describe('bilinear', () => {
  // Esquinas: 100 m arriba a la izquierda, 200 m arriba a la derecha,
  // 300 m abajo a la izquierda, 400 m abajo a la derecha.
  it('en cada esquina devuelve el valor de esa esquina', () => {
    expect(bilinear(100, 200, 300, 400, 0, 0)).toBe(100);
    expect(bilinear(100, 200, 300, 400, 1, 0)).toBe(200);
    expect(bilinear(100, 200, 300, 400, 0, 1)).toBe(300);
    expect(bilinear(100, 200, 300, 400, 1, 1)).toBe(400);
  });

  it('en el centro devuelve el promedio de las cuatro (250 m)', () => {
    expect(bilinear(100, 200, 300, 400, 0.5, 0.5)).toBe(250);
  });

  it('a un cuarto del camino en x por el borde superior: 125 m', () => {
    expect(bilinear(100, 200, 300, 400, 0.25, 0)).toBe(125);
  });
});
