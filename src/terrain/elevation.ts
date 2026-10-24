import {
  TERRAIN_TILE_SIZE,
  TERRAIN_ZOOM,
  bilinear,
  decodeTerrarium,
  lonLatToWorldPixel,
  terrariumTileUrl,
} from './tiles';

/** Alturas de una tesela en metros, fila por fila (256 × 256). */
export type ElevationTile = Float32Array;

/** Caché persistente del navegador: una tesela descargada no se vuelve a pedir. */
const CACHE_NAME = 'hertzo-terreno-v1';

async function fetchWithCache(url: string): Promise<Response> {
  if (typeof caches === 'undefined') return fetch(url);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (response.ok) await cache.put(url, response.clone());
  return response;
}

async function decodeTile(blob: Blob): Promise<ElevationTile> {
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
  const heights = new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = decodeTerrarium(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
  }
  return heights;
}

const tiles = new Map<string, Promise<ElevationTile>>();

/** Tesela de alturas; las peticiones simultáneas a la misma tesela comparten la descarga. */
export function getElevationTile(z: number, x: number, y: number): Promise<ElevationTile> {
  const url = terrariumTileUrl(z, x, y);
  let tile = tiles.get(url);
  if (!tile) {
    tile = fetchWithCache(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`No se pudo descargar el terreno (${response.status}) en ${url}`);
      }
      return decodeTile(await response.blob());
    });
    tile.catch(() => tiles.delete(url));
    tiles.set(url, tile);
  }
  return tile;
}

/** Altura de un píxel del mundo (coordenadas enteras en el zoom dado). */
async function pixelHeight(zoom: number, px: number, py: number): Promise<number> {
  const tileX = Math.floor(px / TERRAIN_TILE_SIZE);
  const tileY = Math.floor(py / TERRAIN_TILE_SIZE);
  const tile = await getElevationTile(zoom, tileX, tileY);
  const col = px - tileX * TERRAIN_TILE_SIZE;
  const row = py - tileY * TERRAIN_TILE_SIZE;
  return tile[row * TERRAIN_TILE_SIZE + col]!;
}

/** Cota del terreno en metros sobre el nivel del mar, interpolada entre los 4 píxeles vecinos. */
export async function elevationAt(lon: number, lat: number, zoom = TERRAIN_ZOOM): Promise<number> {
  // Cada píxel representa su centro, por eso se resta medio píxel antes de interpolar.
  const { x, y } = lonLatToWorldPixel(lon, lat, zoom);
  const fx0 = x - 0.5;
  const fy0 = y - 0.5;
  const x0 = Math.floor(fx0);
  const y0 = Math.floor(fy0);
  const [v00, v10, v01, v11] = await Promise.all([
    pixelHeight(zoom, x0, y0),
    pixelHeight(zoom, x0 + 1, y0),
    pixelHeight(zoom, x0, y0 + 1),
    pixelHeight(zoom, x0 + 1, y0 + 1),
  ]);
  return bilinear(v00, v10, v01, v11, fx0 - x0, fy0 - y0);
}
