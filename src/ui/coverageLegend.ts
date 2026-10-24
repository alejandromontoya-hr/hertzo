import { BALANCE_LEGEND, LEVEL_COLORS, levelBandLabels } from '../coverage/colorScale';
import type { CoverageView } from '../coverage/render';
import { formatFieldValue, parseFieldValue } from './fields';

const VIEWS: { view: CoverageView; label: string; title: string }[] = [
  { view: 'talkOut', label: 'Bajada', title: 'Nivel recibido en el radio (dBm)' },
  { view: 'talkIn', label: 'Subida', title: 'Nivel recibido en el sitio (dBm)' },
  { view: 'balance', label: 'Desbalance', title: 'Dónde llega cada dirección' },
];

export interface LegendState {
  view: CoverageView;
  thresholdsDbm: number[];
  opacity: number;
}

export interface CoverageLegend {
  /** Redibuja las franjas; `sensitivityDbm` es la del mapa visible (radio o sitio). */
  update(state: LegendState, sensitivityDbm: number): void;
}

/** Leyenda sobre el mapa: selector de mapa, franjas de color, umbrales y opacidad. */
export function createCoverageLegend(
  root: HTMLElement,
  initial: LegendState,
  onChange: (state: LegendState) => void,
): CoverageLegend {
  let state = { ...initial, thresholdsDbm: [...initial.thresholdsDbm] };

  root.innerHTML = `
    <div class="legend-views" role="tablist" aria-label="Mapa">
      ${VIEWS.map((v) => `<button type="button" role="tab" data-view="${v.view}">${v.label}</button>`).join('')}
    </div>
    <p class="legend-title"></p>
    <ul class="legend-rows"></ul>
    <div class="legend-thresholds">
      <span>Umbrales (dBm)</span>
      ${state.thresholdsDbm.map((_, i) => `<input type="text" inputmode="decimal" aria-label="Umbral ${i + 1} en dBm" data-threshold="${i}" />`).join('')}
    </div>
    <label class="legend-opacity">Opacidad
      <input type="range" min="0.1" max="1" step="0.05" />
    </label>`;

  const title = root.querySelector<HTMLElement>('.legend-title')!;
  const rows = root.querySelector<HTMLElement>('.legend-rows')!;
  const thresholdsBox = root.querySelector<HTMLElement>('.legend-thresholds')!;
  const opacity = root.querySelector<HTMLInputElement>('.legend-opacity input')!;
  const thresholdInputs = [...root.querySelectorAll<HTMLInputElement>('[data-threshold]')];

  const emit = () => onChange({ ...state, thresholdsDbm: [...state.thresholdsDbm] });

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.addEventListener('click', () => {
      state.view = button.dataset.view as CoverageView;
      emit();
    });
  }
  thresholdInputs.forEach((input, i) => {
    input.value = formatFieldValue(state.thresholdsDbm[i]!);
    input.addEventListener('input', () => {
      const result = parseFieldValue(input.value, { key: 'umbral', label: 'Umbral', unit: 'dBm', min: -150, max: -20 });
      input.setAttribute('aria-invalid', String(!result.ok));
      if (!result.ok) return;
      state.thresholdsDbm[i] = result.value;
      emit();
    });
  });
  opacity.value = String(state.opacity);
  opacity.addEventListener('input', () => {
    state.opacity = Number(opacity.value);
    emit();
  });

  const swatch = (color: string) => `<span class="legend-swatch" style="background:${color}"></span>`;

  return {
    update(next, sensitivityDbm) {
      state = { ...next, thresholdsDbm: [...next.thresholdsDbm] };
      root.hidden = false;
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
        button.setAttribute('aria-selected', String(button.dataset.view === state.view));
      }
      title.textContent = VIEWS.find((v) => v.view === state.view)!.title;
      const isLevel = state.view !== 'balance';
      thresholdsBox.hidden = !isLevel;
      const entries = isLevel
        ? levelBandLabels(sensitivityDbm, state.thresholdsDbm).map((label, i) => ({ color: LEVEL_COLORS[i]!, label }))
        : BALANCE_LEGEND.map((e) => ({ color: e.color, label: e.label }));
      rows.innerHTML =
        entries.map((e) => `<li>${swatch(e.color)}${e.label}</li>`).join('') +
        `<li>${isLevel ? 'Sin color: no llega a la sensibilidad' : 'Sin color: no llega ninguna'}</li>` +
        `<li><span class="legend-swatch legend-hatch"></span>Rayado: baja confianza (ladera empinada junto al sitio)</li>`;
    },
  };
}
