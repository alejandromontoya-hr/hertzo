// Descarga de teselas de terreno con caché, y armado de lectores de cotas por zona.

import { createTerrainSampler, type HeightTile, type TerrainSampler } from './sampler';
import {
  TERRAIN_TILE_SIZE,
  TERRAIN_ZOOM,
  decodeTerrarium,
  terrariumTileUrl,
  tileCount,
  tileKey,
  tileRangeForBounds,
  type Bounds,
} from './tiles';

/** Caché persistente del navegador: una tesela descargada no se vuelve a pedir. */
const CACHE_NAME = 'hertzo-terreno-v1';

/** Teselas decodificadas que se guardan en memoria (~128 KB cada una: 400 ≈ 50 MB). */
const MAX_TILES_IN_MEMORY = 400;

async function fetchWithCache(url: string): Promise<Response> {
  if (typeof caches === 'undefined') return fetch(url);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (response.ok) await cache.put(url, response.clone());
  return response;
}

async function decodeTile(blob: Blob): Promise<HeightTile> {
  // Sin conversión de color: cualquier ajuste alteraría la altura codificada en el píxel.
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no permite leer las teselas de terreno.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE).data;
  // SRTM viene en metros enteros; redondear no pierde información y ocupa la mitad.
  const heights = new Int16Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = Math.round(decodeTerrarium(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!));
  }
  return heights;
}

/** Teselas en memoria, de la menos a la más usada recientemente. */
const tiles = new Map<string, Promise<HeightTile>>();

/** Tesela de alturas; las peticiones simultáneas a la misma tesela comparten la descarga. */
export function getHeightTile(z: number, x: number, y: number): Promise<HeightTile> {
  const key = tileKey(z, x, y);
  let tile = tiles.get(key);
  if (tile) {
    tiles.delete(key); // se vuelve a insertar al final: es la más reciente
  } else {
    const url = terrariumTileUrl(z, x, y);
    tile = fetchWithCache(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`No se pudo descargar el terreno (${response.status}) en ${url}`);
      }
      return decodeTile(await response.blob());
    });
    tile.catch(() => tiles.delete(key));
  }
  tiles.set(key, tile);
  while (tiles.size > MAX_TILES_IN_MEMORY) tiles.delete(tiles.keys().next().value!);
  return tile;
}

/**
 * Descarga (o toma de la caché) todas las teselas de una zona y devuelve un lector de
 * cotas que ya no espera nada. `onProgress` informa teselas listas sobre el total.
 */
export async function loadTerrain(
  bounds: Bounds,
  zoom = TERRAIN_ZOOM,
  onProgress?: (loaded: number, total: number) => void,
): Promise<TerrainSampler> {
  const range = tileRangeForBounds(bounds, zoom);
  const total = tileCount(range);
  const loadedTiles = new Map<string, HeightTile>();
  let loaded = 0;
  const requests: Promise<void>[] = [];
  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      requests.push(
        getHeightTile(zoom, x, y).then((tile) => {
          loadedTiles.set(tileKey(zoom, x, y), tile);
          onProgress?.(++loaded, total);
        }),
      );
    }
  }
  await Promise.all(requests);
  return createTerrainSampler(loadedTiles, zoom);
}

/** Cota del terreno en metros sobre el nivel del mar en un punto. */
export async function elevationAt(lon: number, lat: number, zoom = TERRAIN_ZOOM): Promise<number> {
  const sampler = await loadTerrain({ west: lon, south: lat, east: lon, north: lat }, zoom);
  return sampler.heightAt(lon, lat);
}
