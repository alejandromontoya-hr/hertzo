import type { CoverageProgress, CoverageResult } from '../coverage/computeCoverage';

const secondsFormat = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO');

export interface CoverageStatus {
  showProgress(progress: CoverageProgress): void;
  showDone(result: CoverageResult): void;
  showError(message: string): void;
}

/** Barra de progreso y mensaje del cálculo de cobertura. */
export function createCoverageStatus(root: HTMLElement): CoverageStatus {
  const bar = root.querySelector('progress')!;
  const text = root.querySelector<HTMLElement>('[data-coverage-text]')!;

  return {
    showProgress(p) {
      root.hidden = false;
      bar.hidden = false;
      if (p.phase === 'terrain') {
        // La descarga del terreno ocupa el primer 10 % de la barra.
        bar.value = (0.1 * p.done) / p.total;
        text.textContent = `Descargando terreno: ${p.done} de ${p.total} teselas…`;
      } else {
        bar.value = 0.1 + (0.9 * p.done) / p.total;
        text.textContent = `Calculando radiales: ${integerFormat.format(p.done)} de ${integerFormat.format(p.total)}…`;
      }
    },
    showDone(result) {
      root.hidden = false;
      bar.hidden = true;
      const { plan } = result;
      text.textContent =
        `Listo en ${secondsFormat.format(result.elapsedMs / 1000)} s: ` +
        `${integerFormat.format(plan.radialCount)} radiales × ${integerFormat.format(plan.pointsPerRadial)} puntos, ` +
        `bajada y subida.`;
    },
    showError(message) {
      root.hidden = false;
      bar.hidden = true;
      text.textContent = `No se pudo calcular la cobertura: ${message}`;
    },
  };
}
