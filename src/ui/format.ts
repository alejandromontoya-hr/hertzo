const metersFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** 3102.4 → "3.102 m" */
export function formatMeters(meters: number): string {
  return `${metersFormat.format(meters)} m`;
}

/**
 * Coordenadas en grados decimales con punto, como las muestra un GPS o Google Maps,
 * para poder copiarlas y pegarlas en otras herramientas: "6.26890, -75.66810".
 */
export function formatLonLat(lon: number, lat: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
