// Geodesia sobre una Tierra esférica. Módulo puro.
// A 50 km la diferencia con el elipsoide WGS84 es de unas décimas de por ciento en
// distancia, que en pérdida de trayecto son centésimas de dB.

export interface LonLat {
  lon: number;
  lat: number;
}

/** Radio medio de la Tierra (m), IUGG. */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Distancia por el círculo máximo (fórmula del haversine), en metros. */
export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de a hacia b, en grados desde el norte (0°–360°, sentido horario). */
export function initialBearingDeg(a: LonLat, b: LonLat): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto al que se llega saliendo de `from` con un rumbo y una distancia dados. */
export function destinationPoint(from: LonLat, bearingDeg: number, distance: number): LonLat {
  const δ = distance / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lon: toDeg(λ2), lat: toDeg(φ2) };
}

/** Punto a una fracción (0 a 1) del camino entre a y b, sobre el círculo máximo. */
export function interpolate(a: LonLat, b: LonLat, fraction: number): LonLat {
  const total = distanceM(a, b);
  if (total === 0) return { ...a };
  return destinationPoint(a, initialBearingDeg(a, b), total * fraction);
}
