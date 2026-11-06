// Motor con el entorno del equipo (UIT-R P.2108-1, sección 3.1) encima de otro motor: el
// trayecto se calcula con cada antena que quede por debajo del entorno subida a su altura, y
// luego se suma la pérdida de cada extremo. Así el mapa y los equipos cuentan los edificios
// aunque el terreno (SRTM) no los tenga.

import { clutterLossDb, pathHeightM, type Clutter } from '../rf/clutter';
import type { PropagationEngine } from './engine';

/** Envuelve `inner` con el mismo entorno en los dos extremos (sitio y equipo). */
export function withClutter(inner: PropagationEngine, clutter: Clutter): PropagationEngine {
  return {
    id: `${inner.id}+entorno`,
    name: `${inner.name} con entorno`,
    radialLoss(r) {
      const result = inner.radialLoss({
        ...r,
        txHeightM: pathHeightM(r.txHeightM, clutter),
        rxHeightM: pathHeightM(r.rxHeightM, clutter),
      });
      const extra = clutterLossDb(r.frequencyMHz, r.txHeightM, clutter) + clutterLossDb(r.frequencyMHz, r.rxHeightM, clutter);
      if (extra > 0) for (let k = 0; k < result.lossDb.length; k++) result.lossDb[k]! += extra;
      return result;
    },
  };
}
