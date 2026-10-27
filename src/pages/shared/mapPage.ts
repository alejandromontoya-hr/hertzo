// Armazón de las páginas con mapa: panel de parámetros a la izquierda y mapa a la derecha,
// con leyenda, lectura bajo el cursor y gráfica de perfil encima del mapa.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { createMap } from '../../map/map';

export interface MapPage {
  map: MapLibreMap;
  panel: HTMLElement;
  legendRoot: HTMLElement;
  readoutRoot: HTMLElement;
  profileRoot: HTMLElement;
  /** Busca un elemento dentro de la página. */
  find<T extends HTMLElement = HTMLElement>(selector: string): T;
  destroy(): void;
}

export function createMapPage(root: HTMLElement, panelHtml: string, ariaLabel: string): MapPage {
  root.innerHTML = `
    <div class="page-split">
      <aside class="panel" aria-label="${ariaLabel}">${panelHtml}</aside>
      <div class="map-area">
        <div class="map" aria-label="Mapa"></div>
        <section class="legend" aria-label="Leyenda" hidden></section>
        <div class="readout" role="status" hidden></div>
        <section class="profile-chart" aria-label="Perfil del terreno" hidden></section>
      </div>
    </div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Falta el elemento ${selector} en la página.`);
    return element;
  };
  const map = createMap(find('.map'));
  // Solo en desarrollo: acceso al mapa desde la consola para pruebas manuales.
  if (import.meta.env.DEV) Object.assign(window, { hertzoMap: map });

  return {
    map,
    panel: find('.panel'),
    legendRoot: find('.legend'),
    readoutRoot: find('.readout'),
    profileRoot: find('.profile-chart'),
    find,
    destroy() {
      map.remove();
    },
  };
}

/**
 * Bloque del panel del sitio: nombre, coordenadas (escritas o elegidas en el mapa), cota, perfil
 * de terreno, radio de cálculo y el botón «Simular». `what` completa la ayuda: «la torre».
 */
export function siteSectionHtml(title = 'Sitio', what = 'el sitio'): string {
  return `
    <section class="panel-section" data-site-panel>
      <h2>${title}</h2>
      <div class="form">
        <div class="field field-name">
          <label for="site-name">Nombre</label>
          <input id="site-name" type="text" maxlength="60" autocomplete="off" placeholder="Opcional" data-site-name />
        </div>
        <div class="field">
          <label for="site-lat">Latitud</label>
          <div class="field-input">
            <input id="site-lat" type="text" inputmode="decimal" autocomplete="off" placeholder="6.27940" data-site-lat />
            <span class="field-unit">°</span>
          </div>
        </div>
        <div class="field">
          <label for="site-lon">Longitud</label>
          <div class="field-input">
            <input id="site-lon" type="text" inputmode="decimal" autocomplete="off" placeholder="-75.68530" data-site-lon />
            <span class="field-unit">°</span>
          </div>
          <p class="field-error" data-site-error hidden></p>
        </div>
      </div>
      <button type="button" class="button" data-pick-site aria-pressed="false">Elegir en el mapa</button>
      <p class="hint" data-site-hint>
        Escribe las coordenadas (puedes pegar «6.27940, -75.68530» de Google Maps en Latitud) o pulsa
        «Elegir en el mapa» y haz clic donde va ${what}.
      </p>
      <div data-site-details hidden>
        <dl class="site-details">
          <dt>Cota del terreno</dt>
          <dd data-site-elevation></dd>
        </dl>
        <p class="hint">Arrastra el marcador para moverlo.</p>
        <button type="button" class="button" data-profile-toggle aria-pressed="false">
          Ver perfil del terreno
        </button>
        <p class="hint" data-profile-hint hidden>
          Haz clic en el mapa para elegir el otro extremo del perfil; también puedes
          arrastrarlo. Mientras tanto, los clics no mueven el sitio.
        </p>
      </div>
      <div class="form" data-radius-field></div>
      <div class="simulate" data-simulate-box>
        <button type="button" class="button button-primary" data-simulate hidden>Simular</button>
        <p class="hint" data-simulate-hint hidden></p>
      </div>
    </section>`;
}

/** Bloque del panel con la barra de progreso del cálculo. */
export function coverageStatusHtml(title = 'Cobertura'): string {
  return `
    <section class="panel-section coverage-status" data-coverage-status hidden>
      <h2>${title}</h2>
      <progress max="1" value="0"></progress>
      <p class="hint" data-coverage-text></p>
    </section>`;
}

/** Selector de opciones en botones (bandas, servicios, modelos). */
export function segmentedHtml(name: string, options: { id: string; label: string }[], ariaLabel: string): string {
  return `<div class="segmented" role="radiogroup" aria-label="${ariaLabel}" data-segmented="${name}">
    ${options.map((o) => `<button type="button" role="radio" data-value="${o.id}">${o.label}</button>`).join('')}
  </div>`;
}

/** Conecta un selector en botones: marca el elegido y avisa cuando cambia. */
export function bindSegmented(
  root: HTMLElement,
  name: string,
  initial: string,
  onChange: (value: string) => void,
): { set(value: string): void } {
  const box = root.querySelector<HTMLElement>(`[data-segmented="${name}"]`)!;
  const set = (value: string) => {
    for (const button of box.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-checked', String(button.dataset.value === value));
    }
  };
  box.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
    if (!button) return;
    set(button.dataset.value!);
    onChange(button.dataset.value!);
  });
  set(initial);
  return { set };
}
