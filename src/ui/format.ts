const metersFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const upToTwoDecimals = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const wattsFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Signo menos ASCII para que "-105,1" se lea y se copie igual en todas partes. */
function ascii(text: string): string {
  return text.replace('−', '-');
}

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

/** 50.6 → "50,6 dBm" */
export function formatDbm(dbm: number): string {
  return `${ascii(oneDecimal.format(dbm))} dBm`;
}

/** 5.4 → "5,4 dB" */
export function formatDb(db: number): string {
  return `${ascii(oneDecimal.format(db))} dB`;
}

/** Ganancias de antena con hasta 2 decimales: 8.15 → "8,15 dBi"; 2 → "2,0 dBi" */
export function formatDbi(dbi: number): string {
  return `${ascii(upToTwoDecimals.format(dbi))} dBi`;
}

/** 100 → "100 W"; 0.5 → "0,5 W" */
export function formatWatts(watts: number): string {
  return `${wattsFormat.format(watts)} W`;
}

/** 860 → "860 MHz" */
export function formatMHz(mhz: number): string {
  return `${wattsFormat.format(mhz)} MHz`;
}
