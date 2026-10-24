// Lectura de cotas sin esperas sobre teselas ya descargadas. No depende del navegador,
// así que sirve igual en el hilo principal y en los hilos de cálculo (Web Workers).

import { TERRAIN_TILE_SIZE, bilinear, lonLatToWorldPixel, tileKey } from './tiles';

/** Alturas de una tesela en metros enteros, fila por fila (256 × 256). */
export type HeightTile = Int16Array;

export interface TerrainSampler {
  zoom: number;
  /** Cota del terreno en metros, interpolada entre los 4 píxeles vecinos. */
  heightAt(lon: number, lat: number): number;
}

export function createTerrainSampler(tiles: ReadonlyMap<string, HeightTile>, zoom: number): TerrainSampler {
  const pixelHeight = (px: number, py: number): number => {
    const tileX = Math.floor(px / TERRAIN_TILE_SIZE);
    const tileY = Math.floor(py / TERRAIN_TILE_SIZE);
    const tile = tiles.get(tileKey(zoom, tileX, tileY));
    if (!tile) throw new Error(`Falta la tesela de terreno ${tileKey(zoom, tileX, tileY)}.`);
    return tile[(py - tileY * TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE + (px - tileX * TERRAIN_TILE_SIZE)]!;
  };

  return {
    zoom,
    heightAt(lon, lat) {
      // Cada píxel representa su centro, por eso se resta medio píxel antes de interpolar.
      const { x, y } = lonLatToWorldPixel(lon, lat, zoom);
      const fx = x - 0.5;
      const fy = y - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      return bilinear(
        pixelHeight(x0, y0),
        pixelHeight(x0 + 1, y0),
        pixelHeight(x0, y0 + 1),
        pixelHeight(x0 + 1, y0 + 1),
        fx - x0,
        fy - y0,
      );
    },
  };
}
