import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { DOWNLOAD_ICON } from '../ui/icons';

export interface ExportOption {
  /** Por ejemplo «KMZ para Google Earth». */
  label: string;
  /** Qué trae, en una línea. */
  description: string;
  run(): Promise<void>;
}

export interface ExportControl {
  /** Se apaga mientras no haya un cálculo que exportar. */
  setEnabled(enabled: boolean): void;
}

const DISABLED_TITLE = 'Exportar: primero ubica el sitio y espera el cálculo';

/**
 * Botón flotante «Exportar», encima del de mapa base y con su mismo estilo. Al abrirlo muestra
 * lo que se puede descargar en la página; mientras arma un archivo queda apagado.
 */
class ExportMenuControl implements IControl {
  private container?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private closeOnOutsideClick?: (event: MouseEvent) => void;
  private enabled = false;
  private busy = false;

  constructor(private readonly options: readonly ExportOption[]) {}

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl map-menu';
    container.innerHTML = `
      <div class="map-menu-panel" id="export-menu-panel" hidden>
        <p class="map-menu-title">Exportar</p>
        ${this.options
          .map(
            (o, i) => `
          <button type="button" class="map-menu-option" data-export="${i}">
            <span><strong>${o.label}</strong><small>${o.description}</small></span>
          </button>`,
          )
          .join('')}
      </div>
      <button type="button" class="map-menu-toggle" aria-expanded="false" aria-controls="export-menu-panel">${DOWNLOAD_ICON}</button>`;

    const panel = container.querySelector<HTMLElement>('.map-menu-panel')!;
    const toggle = container.querySelector<HTMLButtonElement>('.map-menu-toggle')!;
    const setOpen = (open: boolean) => {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
    panel.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-export]');
      if (!option) return;
      setOpen(false);
      this.busy = true;
      this.refresh();
      this.options[Number(option.dataset.export)]!.run()
        .catch((error) => console.error(error))
        .finally(() => {
          this.busy = false;
          this.refresh();
        });
    });
    this.closeOnOutsideClick = (event) => {
      if (!container.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', this.closeOnOutsideClick);

    this.container = container;
    this.toggle = toggle;
    this.refresh();
    return container;
  }

  onRemove(): void {
    if (this.closeOnOutsideClick) document.removeEventListener('click', this.closeOnOutsideClick);
    this.container?.remove();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.container?.querySelector<HTMLElement>('.map-menu-panel')?.setAttribute('hidden', '');
    this.refresh();
  }

  private refresh() {
    if (!this.toggle) return;
    this.toggle.disabled = !this.enabled || this.busy;
    this.toggle.setAttribute('aria-busy', String(this.busy));
    const label = this.busy ? 'Preparando el archivo…' : this.enabled ? 'Exportar' : DISABLED_TITLE;
    this.toggle.title = label;
    this.toggle.setAttribute('aria-label', label);
    if (this.toggle.disabled) this.toggle.setAttribute('aria-expanded', 'false');
  }
}

/** Agrega el botón «Exportar» encima del de mapa base; empieza apagado. */
export function addExportControl(map: MapLibreMap, options: readonly ExportOption[]): ExportControl {
  const control = new ExportMenuControl(options);
  // En las esquinas de abajo, MapLibre pone cada control nuevo encima de los anteriores.
  map.addControl(control, 'bottom-right');
  return control;
}
