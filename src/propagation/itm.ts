// Motor ITM (Longley-Rice) de NTIA, compilado a WebAssembly (ver engine/README.md).

import createItmModule, { type ItmWasmModule } from './wasm/itm.mjs';
import type { PropagationEngine, RadialRequest, RadialResult } from './engine';

/** Clima radioeléctrico del ITM. */
export enum RadioClimate {
  Equatorial = 1,
  ContinentalSubtropical = 2,
  MaritimeSubtropical = 3,
  Desert = 4,
  ContinentalTemperate = 5,
  MaritimeTemperateOverLand = 6,
  MaritimeTemperateOverSea = 7,
}

export enum Polarization {
  Horizontal = 0,
  Vertical = 1,
}

export interface ItmParameters {
  climate: RadioClimate;
  /** Refractividad superficial mínima mensual reducida al nivel del mar (unidades N, 250–400). */
  refractivityN0: number;
  polarization: Polarization;
  /** Permitividad relativa del suelo. */
  groundPermittivity: number;
  /** Conductividad del suelo (S/m). */
  groundConductivitySm: number;
  /**
   * Modo de variabilidad: 0 mensaje único, 1 accidental, 2 móvil, 3 radiodifusión;
   * +10 elimina la variabilidad por ubicación, +20 la de situación.
   */
  variabilityMode: number;
  /** Porcentajes de tiempo, ubicación y situación (0–100, sin incluir los extremos). */
  timePct: number;
  locationPct: number;
  situationPct: number;
}

/**
 * Valores por omisión: clima ecuatorial, suelo promedio, polarización vertical y valores
 * medianos (50 %).
 */
export const DEFAULT_ITM_PARAMETERS: ItmParameters = {
  climate: RadioClimate.Equatorial,
  refractivityN0: 360,
  polarization: Polarization.Vertical,
  groundPermittivity: 15,
  groundConductivitySm: 0.005,
  variabilityMode: 2,
  timePct: 50,
  locationPct: 50,
  situationPct: 50,
};

const ERROR_MESSAGES: Record<number, string> = {
  1000: 'La altura de la antena transmisora está fuera de rango (0,5 a 3000 m).',
  1001: 'La altura de la antena receptora está fuera de rango (0,5 a 3000 m).',
  1002: 'Clima radioeléctrico no válido.',
  1003: 'El porcentaje de tiempo está fuera de rango.',
  1004: 'El porcentaje de ubicación está fuera de rango.',
  1005: 'El porcentaje de situación está fuera de rango.',
  1008: 'La refractividad está fuera de rango (250 a 400 unidades N).',
  1009: 'La frecuencia está fuera de rango (20 a 20 000 MHz).',
  1010: 'Polarización no válida.',
  1011: 'La permitividad del suelo está fuera de rango.',
  1012: 'La conductividad del suelo está fuera de rango.',
  1013: 'La impedancia del suelo no es válida.',
  1014: 'Modo de variabilidad no válido.',
  1016: 'El radio efectivo de la Tierra calculado no es válido.',
  1017: 'La distancia del trayecto está fuera de rango.',
  1021: 'La refractividad superficial calculada es demasiado baja.',
  1022: 'La refractividad superficial calculada es demasiado alta.',
};

export class ItmError extends Error {
  constructor(readonly code: number) {
    super(ERROR_MESSAGES[code] ?? `Error del ITM (código ${code}).`);
    this.name = 'ItmError';
  }
}

/** Código del ITM a partir del cual hay error (0 éxito, 1 éxito con advertencias). */
const FIRST_ERROR_CODE = 1000;

export interface PointToPointResult {
  lossDb: number;
  /** Banderas de advertencia del ITM (0 = ninguna). */
  warnings: number;
}

export interface Itm {
  /** Pérdida básica de un trayecto; `pfl` en formato PFL del ITM (tramos, paso, cotas...). */
  pointToPoint(
    pfl: ArrayLike<number>,
    txHeightM: number,
    rxHeightM: number,
    frequencyMHz: number,
    params?: ItmParameters,
  ): PointToPointResult;
  /** Pérdidas a lo largo de un radial (ver `PropagationEngine.radialLoss`). */
  radial(request: RadialRequest, params?: ItmParameters): RadialResult;
}

function wrap(module: ItmWasmModule): Itm {
  /** Copia el perfil PFL a la memoria del módulo; quien llama debe liberar el puntero. */
  const copyPfl = (values: ArrayLike<number>): number => {
    const pointer = module._malloc(values.length * 8);
    module.HEAPF64.set(values, pointer / 8);
    return pointer;
  };

  return {
    pointToPoint(pfl, txHeightM, rxHeightM, frequencyMHz, p = DEFAULT_ITM_PARAMETERS) {
      const pflPointer = copyPfl(pfl);
      const outPointer = module._malloc(16); // double (pérdida) + long (advertencias)
      try {
        const code = module._hertzo_itm_p2p(
          txHeightM, rxHeightM, pflPointer, p.climate, p.refractivityN0, frequencyMHz,
          p.polarization, p.groundPermittivity, p.groundConductivitySm, p.variabilityMode,
          p.timePct, p.locationPct, p.situationPct, outPointer, outPointer + 8,
        );
        if (code >= FIRST_ERROR_CODE) throw new ItmError(code);
        return { lossDb: module.HEAPF64[outPointer / 8]!, warnings: module.HEAP32[(outPointer + 8) / 4]! };
      } finally {
        module._free(pflPointer);
        module._free(outPointer);
      }
    },

    radial(r, p = DEFAULT_ITM_PARAMETERS) {
      const intervals = r.elevationsM.length - 1;
      const count = Math.floor(intervals / r.stride);
      const pfl = new Float64Array(intervals + 3);
      pfl[0] = intervals;
      pfl[1] = r.stepM;
      pfl.set(r.elevationsM, 2);
      const pflPointer = copyPfl(pfl);
      const lossPointer = module._malloc(Math.max(1, count) * 4);
      const warningsPointer = module._malloc(Math.max(1, count) * 4);
      try {
        const code = module._hertzo_itm_radial(
          pflPointer, r.stride, r.txHeightM, r.rxHeightM, p.climate, p.refractivityN0,
          r.frequencyMHz, p.polarization, p.groundPermittivity, p.groundConductivitySm,
          p.variabilityMode, p.timePct, p.locationPct, p.situationPct, lossPointer, warningsPointer,
        );
        // En punto a punto los errores son de parámetros (altura, frecuencia...): fallan
        // en todos los puntos del radial.
        if (code >= FIRST_ERROR_CODE) throw new ItmError(code);
        return {
          lossDb: module.HEAPF32.slice(lossPointer / 4, lossPointer / 4 + count),
          warnings: module.HEAP32.slice(warningsPointer / 4, warningsPointer / 4 + count),
        };
      } finally {
        module._free(pflPointer);
        module._free(lossPointer);
        module._free(warningsPointer);
      }
    },
  };
}

let itm: Promise<Itm> | undefined;

/** Carga el módulo WebAssembly una sola vez. */
export function loadItm(): Promise<Itm> {
  itm ??= createItmModule().then(wrap);
  return itm;
}

/** Motor ITM con la interfaz común de Hertzo. */
export async function createItmEngine(params: ItmParameters = DEFAULT_ITM_PARAMETERS): Promise<PropagationEngine> {
  const model = await loadItm();
  return {
    id: 'itm',
    name: 'ITM / Longley-Rice (NTIA)',
    radialLoss: (request) => model.radial(request, params),
  };
}
