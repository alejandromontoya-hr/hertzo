// Datos que no exigen recalcular (potencias, pérdidas, sensibilidades) que acompañan a cada
// solicitud de cobertura. Si el usuario cambia la frecuencia o una altura y no vuelve a simular,
// el mapa sigue siendo el del cálculo anterior: se pinta y se lee con el balance que le
// correspondía, no con el nuevo sobre pérdidas viejas.

import { sameRequest, type CoverageRequest, type CoverageResult } from '../../coverage/computeCoverage';

/** Solicitudes recordadas; con más, se olvida la más vieja que no sea la del mapa. */
const MAX_ENTRIES = 50;

export interface RequestMemo<T> {
  /** Guarda el valor vigente para la solicitud que se calcularía ahora (null si falta el sitio). */
  remember(request: CoverageRequest | null, value: T): void;
  /**
   * Valor con que se pinta `result`: el vigente si la solicitud de ahora es la misma del mapa;
   * si no, el último que se guardó para la solicitud del mapa.
   */
  forResult(result: CoverageResult, current: T): T;
}

export function createRequestMemo<T>(): RequestMemo<T> {
  const memo = new Map<string, T>();
  let latest: CoverageRequest | null = null;
  return {
    remember(request, value) {
      latest = request;
      if (!request) return;
      const key = JSON.stringify(request);
      memo.delete(key);
      memo.set(key, value);
      while (memo.size > MAX_ENTRIES) memo.delete(memo.keys().next().value!);
    },
    forResult(result, current) {
      if (latest && sameRequest(result.request, latest)) return current;
      return memo.get(JSON.stringify(result.request)) ?? current;
    },
  };
}
