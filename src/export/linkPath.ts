// Rayo entre las antenas de un enlace, en coordenadas para Google Earth. Módulo puro.
// Google Earth dibuja sobre la Tierra real, sin refracción. Para que se vea igual que el perfil
// de Hertzo, cada punto va a la cota del terreno más el despeje del perfil, que ya incluye el
// abultamiento con el factor k elegido: si un cerro toca el rayo en el perfil, lo toca también allá.

import { interpolate } from '../geo/geodesy';
import type { ClearancePoint } from '../rf/pointToPoint';
import type { TerrainProfile } from '../terrain/profile';
import type { KmlPoint3d } from './kml';

/** Máximo de puntos del rayo: con muestras cada 30 m, un enlace de 50 km tendría 1.667. */
export const MAX_RAY_POINTS = 500;

/** Puntos del rayo con su altitud sobre el nivel del mar (m), siempre con los dos extremos. */
export function linkRayPath(
  profile: TerrainProfile,
  points: readonly ClearancePoint[],
  maxPoints = MAX_RAY_POINTS,
): KmlPoint3d[] {
  const n = points.length;
  const stride = Math.max(1, Math.ceil((n - 1) / (maxPoints - 1)));
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i += stride) indices.push(i);
  indices.push(n - 1);
  return indices.map((i) => {
    const p = points[i]!;
    const position = interpolate(profile.from, profile.to, p.distanceM / profile.distanceM);
    return { ...position, altitudeM: profile.elevationsM[i]! + p.clearanceM };
  });
}
