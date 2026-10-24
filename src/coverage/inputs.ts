// Qué datos obligan a volver a correr el motor de propagación. Módulo puro.
//
// El motor solo calcula la pérdida de trayecto, que depende de la geometría y la frecuencia.
// La potencia, las pérdidas de línea, las ganancias y las sensibilidades se aplican después
// sobre ese resultado, así que cambiarlas no exige recalcular.

import type { LonLat } from '../geo/geodesy';
import type { RadioProfile, SiteRxChain, SiteTxChain } from '../rf/linkBudget';

/** Un trayecto que calcula el motor, desde el sitio hacia el radio. */
export interface LinkGeometry {
  /** Altura de la antena del sitio (m). */
  siteHeightM: number;
  /** Altura de la antena del radio (m). */
  radioHeightM: number;
  frequencyMHz: number;
}

export interface PropagationInputs {
  site: LonLat;
  radiusM: number;
  talkOut: LinkGeometry;
  talkIn: LinkGeometry;
}

export function propagationInputs(
  site: LonLat,
  radiusM: number,
  tx: SiteTxChain,
  rx: SiteRxChain,
  radio: RadioProfile,
): PropagationInputs {
  return {
    site,
    radiusM,
    // Bajada: de la antena TX del sitio al radio, en la frecuencia de TX.
    talkOut: { siteHeightM: tx.antennaHeightM, radioHeightM: radio.heightM, frequencyMHz: tx.frequencyMHz },
    // Subida: del radio a la antena RX del sitio, en la frecuencia de RX. La pérdida básica
    // del ITM es recíproca, así que se calcula igual desde el sitio hacia afuera.
    talkIn: { siteHeightM: rx.antennaHeightM, radioHeightM: radio.heightM, frequencyMHz: rx.frequencyMHz },
  };
}

export function sameInputs(a: PropagationInputs | null, b: PropagationInputs): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
