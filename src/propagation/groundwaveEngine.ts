// Motor de onda de tierra para AM (onda media). No usa el relieve: solo distancia,
// frecuencia y tipo de suelo.

import { groundwaveLossDb, type GroundType } from '../rf/groundwave';
import type { PropagationEngine } from './engine';

/**
 * Bandera que marcaba los puntos más allá de la Tierra plana. Desde que el motor usa la serie de
 * residuos de Wait (Tierra esférica) la predicción vale a cualquier distancia y ya no se marca.
 */
export const GROUNDWAVE_WARN_BEYOND_FLAT_EARTH = 0x1;

export function createGroundwaveEngine(ground: GroundType): PropagationEngine {
  // La pérdida solo depende de la distancia: todos los radiales con el mismo paso comparten el
  // resultado, así que se calcula una vez y se copia.
  const cache = new Map<string, Float32Array>();
  return {
    id: 'groundwave',
    name: 'Onda de tierra (Norton y serie de residuos de Wait)',
    radialLoss(r) {
      const count = Math.floor((r.elevationsM.length - 1) / r.stride);
      const key = `${count}|${r.stride}|${r.stepM}|${r.frequencyMHz}`;
      let losses = cache.get(key);
      if (!losses) {
        losses = new Float32Array(count);
        for (let k = 0; k < count; k++) losses[k] = groundwaveLossDb((k + 1) * r.stride * r.stepM, r.frequencyMHz, ground);
        cache.set(key, losses);
      }
      return { lossDb: losses.slice(), warnings: new Int32Array(count) };
    },
  };
}
