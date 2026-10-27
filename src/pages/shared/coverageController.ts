// Control del cálculo de cobertura de una página: guarda los datos del próximo cálculo y lo
// lanza solo cuando el usuario pulsa «Simular». Si después cambia algo que afecta la
// propagación, el mapa conserva el cálculo anterior y el botón pasa a «Simular de nuevo».

import {
  CoverageAbortedError,
  getCoverageRunner,
  sameRequest,
  type CoverageRequest,
  type CoverageResult,
} from '../../coverage/computeCoverage';
import { createCoverageStatus } from '../../ui/coverageStatus';

export interface CoverageController {
  /** Datos del próximo cálculo (null si falta el sitio); no calcula hasta pulsar «Simular». */
  setRequest(request: CoverageRequest | null): void;
  /** La página borró el mapa (por ejemplo al pasar de FM a AM): el botón vuelve a «Simular». */
  forgetResult(): void;
  destroy(): void;
}

/**
 * `simulateRoot` es el bloque `[data-simulate-box]` de `siteSectionHtml`, con el botón y su
 * ayuda; `statusRoot`, el de `coverageStatusHtml`, con la barra de progreso.
 */
export function createCoverageController(
  statusRoot: HTMLElement,
  simulateRoot: HTMLElement,
  onResult: (result: CoverageResult) => void,
  doneDetail?: string,
): CoverageController {
  const status = createCoverageStatus(statusRoot);
  const button = simulateRoot.querySelector<HTMLButtonElement>('[data-simulate]')!;
  const hint = simulateRoot.querySelector<HTMLElement>('[data-simulate-hint]')!;
  let pending: CoverageRequest | null = null;
  /** Datos del cálculo que muestra el mapa. */
  let shown: CoverageRequest | null = null;
  let running = false;
  let abort: AbortController | null = null;
  let destroyed = false;

  function refresh() {
    const upToDate = pending !== null && shown !== null && sameRequest(shown, pending);
    button.hidden = !running && (!pending || upToDate);
    button.disabled = running;
    button.textContent = running ? 'Simulando…' : shown ? 'Simular de nuevo' : 'Simular';
    hint.hidden = running || !shown || !pending || upToDate;
    hint.textContent = 'El mapa muestra el cálculo anterior: cambiaste la ubicación, el radio, la frecuencia o las alturas.';
  }

  async function run() {
    const request = pending;
    if (!request || running) return;
    abort?.abort();
    const current = new AbortController();
    abort = current;
    running = true;
    refresh();
    try {
      const result = await getCoverageRunner().run(request, status.showProgress, current.signal);
      if (destroyed || current.signal.aborted) return;
      shown = request;
      onResult(result);
      status.showDone(result, doneDetail);
      if (import.meta.env.DEV) Object.assign(window, { hertzoCoverage: result });
    } catch (error) {
      if (error instanceof CoverageAbortedError || destroyed) return;
      console.error(error);
      status.showError(error instanceof Error ? error.message : String(error));
    } finally {
      if (abort === current) running = false;
      if (!destroyed) refresh();
    }
  }

  button.addEventListener('click', () => void run());
  refresh();

  return {
    setRequest(request) {
      pending = request;
      refresh();
    },
    forgetResult() {
      abort?.abort();
      running = false;
      shown = null;
      refresh();
    },
    destroy() {
      destroyed = true;
      abort?.abort();
    },
  };
}
