// Motor de onda de tierra para AM (onda media). No usa el relieve: solo distancia,
// frecuencia y tipo de suelo.

import { flatEarthLimitKm, groundwaveLossDb, type GroundType } from '../rf/groundwave';
import type { PropagationEngine } from './engine';

/** Bandera: el punto está más allá de donde vale la Tierra plana (predicción optimista). */
export const GROUNDWAVE_WARN_BEYOND_FLAT_EARTH = 0x1;

export function createGroundwaveEngine(ground: GroundType): PropagationEngine {
  return {
    id: 'groundwave',
    name: 'Onda de tierra (Sommerfeld-Norton)',
    radialLoss(r) {
      const count = Math.floor((r.elevationsM.length - 1) / r.stride);
      const lossDb = new Float32Array(count);
      const warnings = new Int32Array(count);
      const limitM = flatEarthLimitKm(r.frequencyMHz) * 1000;
      for (let k = 0; k < count; k++) {
        const d = (k + 1) * r.stride * r.stepM;
        lossDb[k] = groundwaveLossDb(d, r.frequencyMHz, ground);
        if (d > limitM) warnings[k] = GROUNDWAVE_WARN_BEYOND_FLAT_EARTH;
      }
      return { lossDb, warnings };
    },
  };
}
