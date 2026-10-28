import type { Map as MapLibreMap } from 'maplibre-gl';

export interface PickBanner {
  /** Muestra el aviso, por ejemplo "Haz clic en el mapa donde va la torre". */
  show(text: string): void;
  hide(): void;
}

/**
 * Aviso arriba del mapa mientras se elige un punto con un clic. Esc o "Cancelar" llaman a
 * `onCancel`, que debe apagar el modo de elegir (y con él, el aviso).
 */
export function createPickBanner(map: MapLibreMap, onCancel: () => void): PickBanner {
  const banner = document.createElement('div');
  banner.className = 'pick-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  banner.innerHTML = `<span data-pick-text></span><button type="button" class="pick-banner-cancel">Cancelar</button>`;
  map.getContainer().append(banner);
  const text = banner.querySelector<HTMLElement>('[data-pick-text]')!;

  banner.querySelector('button')!.addEventListener('click', onCancel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !banner.hidden && banner.isConnected) onCancel();
  });

  return {
    show(message) {
      text.textContent = message;
      banner.hidden = false;
    },
    hide() {
      banner.hidden = true;
    },
  };
}
