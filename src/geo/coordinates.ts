// Lectura de coordenadas escritas a mano o pegadas desde Google Maps o un GPS. Módulo puro.

import type { LonLat } from './geodesy';

const NUMBER = /^[-+]?\d+(?:\.\d+)?$/;

/** Grados decimales con punto o con coma: «6.2794», «6,2794», «-75.6853»; null si no es un número. */
export function parseDegrees(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  return NUMBER.test(t) ? Number(t) : null;
}

export const isLatitude = (v: number) => v >= -90 && v <= 90;
export const isLongitude = (v: number) => v >= -180 && v <= 180;

/**
 * Par «latitud, longitud» como lo copia Google Maps: «6.27940, -75.68530». También con punto y
 * coma, con espacios, o con coma sin espacio si los dos números llevan punto («6.2794,-75.6853»).
 * Una sola coma sin espacio, como «6,75», se lee como un número con decimales, no como un par.
 */
export function parseLatLonPair(text: string): LonLat | null {
  const t = text.trim();
  let parts = t.split(/\s*;\s*|,\s+|\s+/).filter(Boolean);
  if (parts.length !== 2) {
    const byComma = t.split(',');
    parts = byComma.length === 2 && byComma.every((p) => p.includes('.')) ? byComma.map((p) => p.trim()) : [];
  }
  if (parts.length !== 2 || !parts.every((p) => NUMBER.test(p))) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  return isLatitude(lat) && isLongitude(lon) ? { lat, lon } : null;
}
