import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { DOWNLOAD_ICON } from '../ui/icons';

export interface ExportOption {
  /** Por ejemplo "KMZ para Google Earth". */
  label: string;
  /** Qué trae, en una línea. */
  description: string;
  run(): Promise<void>;
}

export interface ExportControl {
  /** Se apaga mientras no haya un cálculo que exportar. */
  setEnabled(enabled: boolean): void;
}

/** Lo que dice el botón apagado sobre el mapa. */
const MAP_DISABLED_TITLE = 'Exportar: primero ubica el sitio y espera el cálculo';

interface ExportMenu extends ExportControl {
  element: HTMLElement;
  destroy(): void;
}

/**
 * Botón redondo "Exportar" con el estilo del de mapa base. Al abrirlo muestra lo que se puede
 * descargar en la página; mientras arma un archivo queda apagado. Empieza apagado.
 */
function createExportMenu(options: readonly ExportOption[], disabledTitle: string): ExportMenu {
  const container = document.createElement('div');
  container.className = 'maplibregl-ctrl map-menu';
  container.innerHTML = `
    <div class="map-menu-panel" id="export-menu-panel" hidden>
      <p class="map-menu-title">Exportar</p>
      ${options
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
  let enabled = false;
  let busy = false;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  const refresh = () => {
    toggle.disabled = !enabled || busy;
    toggle.setAttribute('aria-busy', String(busy));
    const label = busy ? 'Preparando el archivo…' : enabled ? 'Exportar' : disabledTitle;
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    if (toggle.disabled) setOpen(false);
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
    busy = true;
    refresh();
    options[Number(option.dataset.export)]!.run()
      .catch((error) => console.error(error))
      .finally(() => {
        busy = false;
        refresh();
      });
  });
  const closeOnOutsideClick = (event: MouseEvent) => {
    if (!container.contains(event.target as Node)) setOpen(false);
  };
  document.addEventListener('click', closeOnOutsideClick);
  refresh();

  return {
    element: container,
    setEnabled(next) {
      enabled = next;
      refresh();
    },
    destroy() {
      document.removeEventListener('click', closeOnOutsideClick);
      container.remove();
    },
  };
}

class ExportMenuControl implements IControl {
  constructor(private readonly menu: ExportMenu) {}

  onAdd(): HTMLElement {
    return this.menu.element;
  }

  onRemove(): void {
    this.menu.destroy();
  }
}

/** Agrega el botón "Exportar" encima del de mapa base. */
export function addExportControl(map: MapLibreMap, options: readonly ExportOption[]): ExportControl {
  const menu = createExportMenu(options, MAP_DISABLED_TITLE);
  // En las esquinas de abajo, MapLibre pone cada control nuevo encima de los anteriores.
  map.addControl(new ExportMenuControl(menu), 'bottom-right');
  return menu;
}

/**
 * El mismo botón en la esquina inferior derecha de un editor de planos (Interiores, Cavernas).
 * `disabledTitle` dice qué falta para poder exportar.
 */
export function addPlanExport(
  host: HTMLElement,
  options: readonly ExportOption[],
  disabledTitle: string,
): ExportControl & { destroy(): void } {
  const menu = createExportMenu(options, disabledTitle);
  menu.element.classList.add('plan-export');
  host.append(menu.element);
  return menu;
}
