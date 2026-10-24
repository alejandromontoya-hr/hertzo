// Teselas de elevación: AWS Terrain Tiles (Open Data), formato Terrarium.
// En Colombia la fuente es SRTM 30 m (NASA). Cada tesela es un PNG de 256×256
// donde el color de cada píxel codifica la altura del terreno en metros.

export const TERRAIN_TILE_SIZE = 256;

/** Zoom usado para leer el terreno. En zoom 12 cada píxel mide unos 38 m en Antioquia. */
export const TERRAIN_ZOOM = 12;

/** Máximo zoom disponible en AWS Terrain Tiles. */
export const TERRAIN_MAX_ZOOM = 15;

export const TERRARIUM_URL_TEMPLATE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export function terrariumTileUrl(z: number, x: number, y: number): string {
  return TERRARIUM_URL_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Altura en metros a partir del color de un píxel Terrarium: (R·256 + G + B/256) − 32768. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Coordenadas en píxeles del mundo Web Mercator para un zoom dado.
 * En zoom z el mundo mide 256·2^z píxeles de lado; (0, 0) es la esquina noroeste.
 */
export function lonLatToWorldPixel(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const worldSize = TERRAIN_TILE_SIZE * 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * worldSize;
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * worldSize;
  return { x, y };
}

/** Rectángulo geográfico en grados. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TileRange {
  zoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/**
 * Teselas que cubren un rectángulo, con un píxel de margen alrededor: la interpolación
 * bilineal cerca del borde necesita el píxel vecino, que puede estar en la tesela de al lado.
 */
export function tileRangeForBounds(bounds: Bounds, zoom: number): TileRange {
  const maxPixel = TERRAIN_TILE_SIZE * 2 ** zoom - 1;
  const nw = lonLatToWorldPixel(bounds.west, bounds.north, zoom);
  const se = lonLatToWorldPixel(bounds.east, bounds.south, zoom);
  const clamp = (px: number) => Math.min(maxPixel, Math.max(0, px));
  const toTile = (px: number) => Math.floor(clamp(px) / TERRAIN_TILE_SIZE);
  return {
    zoom,
    minX: toTile(nw.x - 1),
    maxX: toTile(se.x + 1),
    minY: toTile(nw.y - 1),
    maxY: toTile(se.y + 1),
  };
}

export function tileCount(range: TileRange): number {
  return (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
}

/**
 * Interpolación bilineal entre cuatro valores vecinos.
 * v00 arriba-izquierda, v10 arriba-derecha, v01 abajo-izquierda, v11 abajo-derecha;
 * fx y fy van de 0 a 1 dentro de la celda.
 */
export function bilinear(
  v00: number,
  v10: number,
  v01: number,
  v11: number,
  fx: number,
  fy: number,
): number {
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}
