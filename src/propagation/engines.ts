// Catálogo de motores de propagación. Una página describe el motor que quiere con un
// `EngineSpec` (datos simples, que viajan a los hilos de cálculo) y `createEngine` lo arma.

import type { GroundType } from '../rf/groundwave';
import type { PropagationEngine } from './engine';
import { GROUNDWAVE_WARN_BEYOND_FLAT_EARTH, createGroundwaveEngine } from './groundwaveEngine';
import { DEFAULT_ITM_PARAMETERS, createItmEngine, type ItmParameters } from './itm';

export type EngineSpec =
  | { id: 'itm'; params?: ItmParameters }
  | { id: 'groundwave'; ground: GroundType };

/** Si el motor usa el perfil de terreno; los que no lo usan se ahorran la descarga. */
export function engineNeedsTerrain(spec: EngineSpec): boolean {
  switch (spec.id) {
    case 'itm':
      return true;
    case 'groundwave':
      return false;
  }
}

/** Bandera de advertencia que el motor usa para «baja confianza» (0 si no marca nada). */
export function lowConfidenceMask(spec: EngineSpec): number {
  switch (spec.id) {
    case 'itm':
      // Ángulo de horizonte grande en el sitio (Warnings.h 0x0080).
      return 0x0080;
    case 'groundwave':
      return GROUNDWAVE_WARN_BEYOND_FLAT_EARTH;
  }
}

export function createEngine(spec: EngineSpec): Promise<PropagationEngine> {
  switch (spec.id) {
    case 'itm':
      return createItmEngine(spec.params ?? DEFAULT_ITM_PARAMETERS);
    case 'groundwave':
      return Promise.resolve(createGroundwaveEngine(spec.ground));
  }
}
