import { formatFieldValue, parseFieldValue } from './fields';

export interface LegendView {
  id: string;
  label: string;
}

export interface LegendEntry {
  color: string;
  label: string;
}

/** Lo que muestra la leyenda en cada momento; la página decide el contenido. */
export interface LegendContent {
  views: LegendView[];
  activeView: string;
  title: string;
  entries: LegendEntry[];
  /** Qué significa un píxel sin color. */
  emptyLabel?: string;
  /** Si se da, aparece la fila del rayado de baja confianza con este texto. */
  hatchLabel?: string;
  /** Umbrales editables (de mayor a menor) de la vista activa. */
  thresholds?: { values: number[]; unit: string; min: number; max: number };
  opacity: number;
}

export interface LegendCallbacks {
  onView(id: string): void;
  onThresholds(values: number[]): void;
  onOpacity(opacity: number): void;
}

export interface MapLegend {
  update(content: LegendContent): void;
  hide(): void;
}

/** Leyenda sobre el mapa: selector de vista, franjas de color, umbrales y opacidad. */
export function createMapLegend(root: HTMLElement, callbacks: LegendCallbacks): MapLegend {
  root.innerHTML = `
    <div class="legend-views" role="tablist" aria-label="Mapa"></div>
    <p class="legend-title"></p>
    <ul class="legend-rows"></ul>
    <div class="legend-thresholds" hidden><span class="legend-thresholds-label"></span></div>
    <label class="legend-opacity">Opacidad
      <input type="range" min="0.1" max="1" step="0.05" />
    </label>`;

  const viewsBox = root.querySelector<HTMLElement>('.legend-views')!;
  const title = root.querySelector<HTMLElement>('.legend-title')!;
  const rows = root.querySelector<HTMLElement>('.legend-rows')!;
  const thresholdsBox = root.querySelector<HTMLElement>('.legend-thresholds')!;
  const thresholdsLabel = root.querySelector<HTMLElement>('.legend-thresholds-label')!;
  const opacity = root.querySelector<HTMLInputElement>('.legend-opacity input')!;

  let viewsKey = '';
  let thresholdInputs: HTMLInputElement[] = [];
  let thresholdValues: number[] = [];
  let thresholdRange = { min: -150, max: 150, unit: '' };

  opacity.addEventListener('input', () => callbacks.onOpacity(Number(opacity.value)));

  const buildThresholdInputs = (count: number) => {
    for (const input of thresholdInputs) input.remove();
    thresholdInputs = Array.from({ length: count }, (_, i) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.setAttribute('aria-label', `Umbral ${i + 1}`);
      input.addEventListener('input', () => {
        const result = parseFieldValue(input.value, {
          key: 'umbral',
          label: 'Umbral',
          unit: thresholdRange.unit,
          min: thresholdRange.min,
          max: thresholdRange.max,
        });
        input.setAttribute('aria-invalid', String(!result.ok));
        if (!result.ok) return;
        thresholdValues[i] = result.value;
        callbacks.onThresholds([...thresholdValues]);
      });
      thresholdsBox.append(input);
      return input;
    });
  };

  const swatch = (color: string) => `<span class="legend-swatch" style="background:${color}"></span>`;

  return {
    update(content) {
      root.hidden = false;
      const key = content.views.map((v) => `${v.id}:${v.label}`).join('|');
      if (key !== viewsKey) {
        viewsKey = key;
        viewsBox.replaceChildren(
          ...content.views.map((view) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.dataset.view = view.id;
            button.textContent = view.label;
            button.addEventListener('click', () => callbacks.onView(view.id));
            return button;
          }),
        );
      }
      viewsBox.hidden = content.views.length < 2;
      for (const button of viewsBox.querySelectorAll<HTMLButtonElement>('button')) {
        button.setAttribute('aria-selected', String(button.dataset.view === content.activeView));
      }

      title.textContent = content.title;
      rows.innerHTML =
        content.entries.map((e) => `<li>${swatch(e.color)}${e.label}</li>`).join('') +
        (content.emptyLabel ? `<li>Sin color: ${content.emptyLabel}</li>` : '') +
        (content.hatchLabel
          ? `<li><span class="legend-swatch legend-hatch"></span>Rayado: ${content.hatchLabel}</li>`
          : '');

      const t = content.thresholds;
      thresholdsBox.hidden = !t;
      if (t) {
        thresholdRange = { min: t.min, max: t.max, unit: t.unit };
        thresholdsLabel.textContent = `Umbrales (${t.unit})`;
        if (thresholdInputs.length !== t.values.length) buildThresholdInputs(t.values.length);
        thresholdValues = [...t.values];
        thresholdInputs.forEach((input, i) => {
          // No se toca el campo que el usuario está escribiendo.
          if (document.activeElement !== input) input.value = formatFieldValue(t.values[i]!);
        });
      }
      if (document.activeElement !== opacity) opacity.value = String(content.opacity);
    },
    hide() {
      root.hidden = true;
    },
  };
}
