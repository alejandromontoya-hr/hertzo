// Control del cálculo de cobertura de una página: espera a que el usuario deje de escribir,
// recalcula solo si cambió algo que afecta la propagación y cancela el cálculo anterior.

import {
  CoverageAbortedError,
  getCoverageRunner,
  sameRequest,
  type CoverageRequest,
  type CoverageResult,
} from '../../coverage/computeCoverage';
import { createCoverageStatus } from '../../ui/coverageStatus';

/** Espera tras el último cambio antes de recalcular, para no lanzar un cálculo por tecla. */
const DEBOUNCE_MS = 400;

export interface CoverageController {
  /** Pide un cálculo con estos datos; si son los mismos del último, no hace nada. */
  schedule(request: CoverageRequest | null): void;
  destroy(): void;
}

export function createCoverageController(
  statusRoot: HTMLElement,
  onResult: (result: CoverageResult) => void,
  doneDetail?: string,
): CoverageController {
  const status = createCoverageStatus(statusRoot);
  let lastRequest: CoverageRequest | null = null;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  async function run(request: CoverageRequest) {
    abort?.abort();
    const current = new AbortController();
    abort = current;
    try {
      const result = await getCoverageRunner().run(request, status.showProgress, current.signal);
      if (destroyed || current.signal.aborted) return;
      onResult(result);
      status.showDone(result, doneDetail);
      if (import.meta.env.DEV) Object.assign(window, { hertzoCoverage: result });
    } catch (error) {
      if (error instanceof CoverageAbortedError || destroyed) return;
      console.error(error);
      lastRequest = null; // permite reintentar con los mismos datos
      status.showError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    schedule(request) {
      if (!request || sameRequest(lastRequest, request)) return;
      lastRequest = request;
      clearTimeout(timer);
      timer = setTimeout(() => void run(request), DEBOUNCE_MS);
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      abort?.abort();
    },
  };
}
