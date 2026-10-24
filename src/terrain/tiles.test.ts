import { describe, expect, it } from 'vitest';
import {
  bilinear,
  decodeTerrarium,
  lonLatToWorldPixel,
  terrariumTileUrl,
  tileCount,
  tileRangeForBounds,
} from './tiles';

describe('tileRangeForBounds', () => {
  it('en zoom 0 todo el mundo es una sola tesela', () => {
    const r = tileRangeForBounds({ west: -80, south: 0, east: -70, north: 10 }, 0);
    expect(r).toEqual({ zoom: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  // Zoom 2: el mundo mide 1024 px; cada tesela cubre 90° de longitud.
  // lon 10° → x = 190/360·1024 = 540,4 px y lon 80° → 739,6 px: tesela x = 2.
  // lat 10° → y = 483,4 px (tesela 1); el ecuador → y = 512 px, que con el píxel de margen
  // llega a 513 px (tesela 2). Resultado: x 2..2, y 1..2 = 2 teselas.
  it('zoom 2, de lon 10° a 80° y lat 0° a 10°: 2 teselas', () => {
    const r = tileRangeForBounds({ west: 10, south: 0, east: 80, north: 10 }, 2);
    expect(r).toEqual({ zoom: 2, minX: 2, maxX: 2, minY: 1, maxY: 2 });
    expect(tileCount(r)).toBe(2);
  });

  it('un punto justo en el borde de 4 teselas pide las 4 (zoom 1, lon 0°, lat 0°)', () => {
    const r = tileRangeForBounds({ west: 0, south: 0, east: 0, north: 0 }, 1);
    expect(r).toEqual({ zoom: 1, minX: 0, maxX: 1, minY: 0, maxY: 1 });
  });
});

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
