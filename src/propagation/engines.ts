// Catálogo de motores de propagación. Una página describe el motor que quiere con un
// `EngineSpec` (datos simples, que viajan a los hilos de cálculo) y `createEngine` lo arma.

import type { HataEnvironment } from '../rf/cellular';
import type { GroundType } from '../rf/groundwave';
import { EMPIRICAL_WARN_OUT_OF_RANGE, createHataEngine, createUmaEngine } from './empiricalEngines';
import type { PropagationEngine } from './engine';
import { GROUNDWAVE_WARN_BEYOND_FLAT_EARTH, createGroundwaveEngine } from './groundwaveEngine';
import { DEFAULT_ITM_PARAMETERS, createItmEngine, type ItmParameters } from './itm';

export type EngineSpec =
  | { id: 'itm'; params?: ItmParameters }
  | { id: 'groundwave'; ground: GroundType }
  | { id: 'hata'; environment: HataEnvironment }
  | { id: 'uma' };

/** Si el motor usa el perfil de terreno; los que no lo usan se ahorran la descarga. */
export function engineNeedsTerrain(spec: EngineSpec): boolean {
  switch (spec.id) {
    case 'itm':
      return true;
    case 'hata':
      // Solo para la altura efectiva de la antena sobre el terreno promedio.
      return true;
    case 'groundwave':
    case 'uma':
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
    case 'hata':
    case 'uma':
      return EMPIRICAL_WARN_OUT_OF_RANGE;
  }
}

export function createEngine(spec: EngineSpec): Promise<PropagationEngine> {
  switch (spec.id) {
    case 'itm':
      return createItmEngine(spec.params ?? DEFAULT_ITM_PARAMETERS);
    case 'groundwave':
      return Promise.resolve(createGroundwaveEngine(spec.ground));
    case 'hata':
      return Promise.resolve(createHataEngine(spec.environment));
    case 'uma':
      return Promise.resolve(createUmaEngine());
  }
}
