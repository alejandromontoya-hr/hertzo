// Qué datos obligan a volver a correr el motor de propagación. Módulo puro.
//
// El motor solo calcula la pérdida de trayecto, que depende de la geometría y la frecuencia.
// La potencia, las pérdidas de línea, las ganancias y las sensibilidades se aplican después
// sobre ese resultado, así que cambiarlas no exige recalcular.

import type { LonLat } from '../geo/geodesy';
import type { EngineSpec } from '../propagation/engines';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../rf/linkBudget';
import type { CoverageRequest } from './computeCoverage';

/** Un trayecto que calcula el motor, desde el sitio hacia el usuario. */
export interface LinkGeometry {
  /** Altura de la antena del sitio (m). */
  siteHeightM: number;
  /** Altura de la antena del usuario (m). */
  radioHeightM: number;
  frequencyMHz: number;
}

/** Índices de los trayectos de un cálculo de radio profesional. */
export const TALK_OUT = 0;
export const TALK_IN = 1;

/** Solicitud de cobertura de un sitio de radio profesional: bajada y subida sobre el mismo terreno. */
export function lmrCoverageRequest(
  site: LonLat,
  radiusM: number,
  tx: SiteTxChain,
  rx: SiteRxChain,
  radio: RadioProfile,
  engine: EngineSpec = { id: 'itm' },
): CoverageRequest {
  return {
    site,
    radiusM,
    engine,
    links: [
      // Bajada: de la antena TX del sitio al radio, en la frecuencia de TX.
      { siteHeightM: tx.antennaHeightM, radioHeightM: radio.heightM, frequencyMHz: tx.frequencyMHz },
      // Subida: del radio a la antena RX del sitio, en la frecuencia de RX. La pérdida básica
      // del ITM es recíproca, así que se calcula igual desde el sitio hacia afuera.
      { siteHeightM: rx.antennaHeightM, radioHeightM: radio.heightM, frequencyMHz: rx.frequencyMHz },
    ],
  };
}
