// Catálogo de motores de propagación. Una página describe el motor que quiere con un
// `EngineSpec` (datos simples, que viajan a los hilos de cálculo) y `createEngine` lo arma.

import type { PropagationEngine } from './engine';
import { DEFAULT_ITM_PARAMETERS, createItmEngine, type ItmParameters } from './itm';

export type EngineSpec = { id: 'itm'; params?: ItmParameters };

/** Si el motor usa el perfil de terreno; los que no lo usan se ahorran la descarga. */
export function engineNeedsTerrain(spec: EngineSpec): boolean {
  switch (spec.id) {
    case 'itm':
      return true;
  }
}

/** Bandera de advertencia que el motor usa para «baja confianza» (0 si no marca nada). */
export function lowConfidenceMask(spec: EngineSpec): number {
  switch (spec.id) {
    case 'itm':
      // Ángulo de horizonte grande en el sitio (Warnings.h 0x0080).
      return 0x0080;
  }
}

export function createEngine(spec: EngineSpec): Promise<PropagationEngine> {
  switch (spec.id) {
    case 'itm':
      return createItmEngine(spec.params ?? DEFAULT_ITM_PARAMETERS);
  }
}
