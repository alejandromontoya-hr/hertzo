// Pérdida de trayecto del sitio a un equipo concreto, con el ITM punto a punto sobre el perfil
// real del terreno y la altura propia de ese equipo. Bajada y subida por separado, porque van
// en frecuencias distintas y el sitio puede tener antenas a alturas distintas.

import { distanceM, type LonLat } from '../geo/geodesy';
import { loadItm } from '../propagation/itm';
import { clutterLossDb, pathHeightM, type Clutter } from '../rf/clutter';
import { closeRangeLossDb } from './devices';
import { loadTerrain } from '../terrain/elevation';
import { profileBounds, sampleProfile } from '../terrain/profile';

/** Paso del perfil (m), el mismo de Enlaces punto a punto. */
const PROFILE_STEP_M = 30;
/** Más cerca que esto el ITM no aplica: se usa espacio libre con la distancia real a la antena. */
const MIN_DISTANCE_M = 50;

export interface DevicePath {
  site: LonLat;
  device: LonLat;
  deviceHeightM: number;
  down: { siteHeightM: number; frequencyMHz: number };
  up: { siteHeightM: number; frequencyMHz: number };
  /** Entorno del equipo y del sitio (UIT-R P.2108); null o ausente, terreno limpio. */
  clutter?: Clutter | null;
}

export interface DeviceLoss {
  distanceM: number;
  /** Pérdida básica de trayecto (dB); NaN si no se pudo calcular. */
  downDb: number;
  upDb: number;
  /** Lo que sumó el entorno en subida, en los dos extremos (dB); 0 sin entorno. */
  clutterUpDb: number;
}

export async function deviceLoss(path: DevicePath): Promise<DeviceLoss> {
  const d = distanceM(path.site, path.device);
  const clutter = path.clutter ?? null;
  /** Lo que suma el entorno en los dos extremos, en esa frecuencia. */
  const endLoss = (siteHeightM: number, frequencyMHz: number) =>
    clutter ? clutterLossDb(frequencyMHz, siteHeightM, clutter) + clutterLossDb(frequencyMHz, path.deviceHeightM, clutter) : 0;
  if (d < MIN_DISTANCE_M) {
    // Tan cerca, espacio libre entre las antenas reales; el entorno suma igual que más lejos,
    // para que el resultado no salte al cruzar los 50 m.
    return {
      distanceM: d,
      clutterUpDb: endLoss(path.up.siteHeightM, path.up.frequencyMHz),
      downDb: closeRangeLossDb(d, path.down.siteHeightM, path.deviceHeightM, path.down.frequencyMHz) + endLoss(path.down.siteHeightM, path.down.frequencyMHz),
      upDb: closeRangeLossDb(d, path.up.siteHeightM, path.deviceHeightM, path.up.frequencyMHz) + endLoss(path.up.siteHeightM, path.up.frequencyMHz),
    };
  }
  const [sampler, itm] = await Promise.all([loadTerrain(profileBounds(path.site, path.device)), loadItm()]);
  const profile = sampleProfile(sampler, path.site, path.device, PROFILE_STEP_M);
  const pfl = [profile.elevationsM.length - 1, profile.stepM, ...profile.elevationsM];
  const loss = (siteHeightM: number, frequencyMHz: number) => {
    try {
      const lossDb = itm.pointToPoint(pfl, pathHeightM(siteHeightM, clutter), pathHeightM(path.deviceHeightM, clutter), frequencyMHz).lossDb;
      return lossDb + endLoss(siteHeightM, frequencyMHz);
    } catch {
      return Number.NaN;
    }
  };
  return {
    distanceM: d,
    clutterUpDb: endLoss(path.up.siteHeightM, path.up.frequencyMHz),
    downDb: loss(path.down.siteHeightM, path.down.frequencyMHz),
    upDb: loss(path.up.siteHeightM, path.up.frequencyMHz),
  };
}
