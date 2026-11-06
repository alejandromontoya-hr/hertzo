// Pérdida de trayecto del sitio a un equipo concreto, con el ITM punto a punto sobre el perfil
// real del terreno y la altura propia de ese equipo. Bajada y subida por separado, porque van
// en frecuencias distintas y el sitio puede tener antenas a alturas distintas.

import { distanceM, type LonLat } from '../geo/geodesy';
import { loadItm } from '../propagation/itm';
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
}

export interface DeviceLoss {
  distanceM: number;
  /** Pérdida básica de trayecto (dB); NaN si no se pudo calcular. */
  downDb: number;
  upDb: number;
}

export async function deviceLoss(path: DevicePath): Promise<DeviceLoss> {
  const d = distanceM(path.site, path.device);
  if (d < MIN_DISTANCE_M) {
    return {
      distanceM: d,
      downDb: closeRangeLossDb(d, path.down.siteHeightM, path.deviceHeightM, path.down.frequencyMHz),
      upDb: closeRangeLossDb(d, path.up.siteHeightM, path.deviceHeightM, path.up.frequencyMHz),
    };
  }
  const [sampler, itm] = await Promise.all([loadTerrain(profileBounds(path.site, path.device)), loadItm()]);
  const profile = sampleProfile(sampler, path.site, path.device, PROFILE_STEP_M);
  const pfl = [profile.elevationsM.length - 1, profile.stepM, ...profile.elevationsM];
  const loss = (siteHeightM: number, frequencyMHz: number) => {
    try {
      return itm.pointToPoint(pfl, siteHeightM, path.deviceHeightM, frequencyMHz).lossDb;
    } catch {
      return Number.NaN;
    }
  };
  return {
    distanceM: d,
    downDb: loss(path.down.siteHeightM, path.down.frequencyMHz),
    upDb: loss(path.up.siteHeightM, path.up.frequencyMHz),
  };
}
