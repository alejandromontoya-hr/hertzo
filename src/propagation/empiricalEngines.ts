// Motores empíricos para celular: Okumura-Hata / COST-231 y 3GPP 38.901 UMa.

import { hataInRange, hataLossDb, umaNlosLossDb, type HataEnvironment } from '../rf/cellular';
import type { PropagationEngine, RadialRequest } from './engine';

/** Bandera: el punto está fuera del rango de validez del modelo empírico. */
export const EMPIRICAL_WARN_OUT_OF_RANGE = 0x1;

/**
 * Hata se ajustó de 1 a 20 km. Entre 0,5 y 1 km se extrapola, como es práctica común; solo
 * por debajo de 0,5 km se marca fuera de rango.
 */
const HATA_MIN_DRAWN_KM = 0.5;

/** Límites de la altura efectiva que se usan en la fórmula (m), para no salirse del todo del modelo. */
const MIN_EFFECTIVE_HEIGHT_M = 10;
const MAX_EFFECTIVE_HEIGHT_M = 300;

/**
 * Altura efectiva de la antena del sitio (m): la mayor entre su altura sobre el suelo y su
 * altura sobre el terreno promedio entre 3 y 15 km del radial (o todo el radial si es más
 * corto). En un cerro cuenta lo que domina el entorno; en un valle (Medellín, por ejemplo)
 * el promedio queda por encima de la torre y se usa su altura real.
 */
export function effectiveHeightM(r: RadialRequest): number {
  const e = r.elevationsM;
  let start = Math.ceil(3000 / r.stepM);
  let end = Math.min(e.length - 1, Math.floor(15000 / r.stepM));
  if (start > end) {
    start = 1;
    end = e.length - 1;
  }
  let sum = 0;
  for (let i = start; i <= end; i++) sum += e[i]!;
  const mean = end >= start ? sum / (end - start + 1) : e[0]!;
  const aboveAverage = r.txHeightM + e[0]! - mean;
  return Math.min(MAX_EFFECTIVE_HEIGHT_M, Math.max(MIN_EFFECTIVE_HEIGHT_M, r.txHeightM, aboveAverage));
}

export function createHataEngine(environment: HataEnvironment): PropagationEngine {
  return {
    id: 'hata',
    name: 'Okumura-Hata / COST-231',
    radialLoss(r) {
      const count = Math.floor((r.elevationsM.length - 1) / r.stride);
      const lossDb = new Float32Array(count);
      const warnings = new Int32Array(count);
      const hb = effectiveHeightM(r);
      for (let k = 0; k < count; k++) {
        const dKm = ((k + 1) * r.stride * r.stepM) / 1000;
        lossDb[k] = hataLossDb(r.frequencyMHz, hb, r.rxHeightM, dKm, environment);
        if (!hataInRange(r.frequencyMHz, hb, Math.max(1, dKm)) || dKm < HATA_MIN_DRAWN_KM) {
          warnings[k] = EMPIRICAL_WARN_OUT_OF_RANGE;
        }
      }
      return { lossDb, warnings };
    },
  };
}

export function createUmaEngine(): PropagationEngine {
  return {
    id: 'uma',
    name: '3GPP 38.901 UMa',
    radialLoss(r) {
      const count = Math.floor((r.elevationsM.length - 1) / r.stride);
      const lossDb = new Float32Array(count);
      const warnings = new Int32Array(count);
      for (let k = 0; k < count; k++) {
        const d = (k + 1) * r.stride * r.stepM;
        lossDb[k] = umaNlosLossDb(r.frequencyMHz, r.txHeightM, r.rxHeightM, Math.max(10, d));
        if (d < 10 || d > 5000 || r.frequencyMHz < 500) warnings[k] = EMPIRICAL_WARN_OUT_OF_RANGE;
      }
      return { lossDb, warnings };
    },
  };
}
