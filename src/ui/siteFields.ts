// Campos de un punto en el panel: nombre, latitud y longitud. Los usan el sitio de las páginas
// de cobertura y los extremos A y B de un enlace.

import { isLatitude, isLongitude, parseDegrees, parseLatLonPair } from '../geo/coordinates';
import type { LonLat } from '../geo/geodesy';
import { PIN_ICON } from './icons';

/** Coordenadas con 5 decimales (≈ 1 m), con punto, como las muestra un GPS. */
const degrees = (v: number) => v.toFixed(5);

/**
 * Los tres campos y el botón con ícono de ubicación para elegir el punto en el mapa. `id`
 * distingue los de cada punto de la página ("site", "end-a"…); `what` dice qué se ubica
 * ("la torre", "el extremo A") para el aviso sobre el mapa.
 */
export function siteFieldsHtml(id: string, name = '', what = 'el sitio'): string {
  return `
    <div class="form" data-site-fields="${id}">
      <div class="field field-name">
        <label for="${id}-name">Nombre</label>
        <input id="${id}-name" type="text" maxlength="60" autocomplete="off" placeholder="Opcional" value="${name.replace(/"/g, '&quot;')}" data-site-name />
      </div>
      <div class="coords">
        <div class="form">
          <div class="field">
            <label for="${id}-lat">Latitud</label>
            <div class="field-input">
              <input id="${id}-lat" type="text" inputmode="decimal" autocomplete="off" placeholder="6.27940" data-site-lat />
              <span class="field-unit">°</span>
            </div>
          </div>
          <div class="field">
            <label for="${id}-lon">Longitud</label>
            <div class="field-input">
              <input id="${id}-lon" type="text" inputmode="decimal" autocomplete="off" placeholder="-75.68530" data-site-lon />
              <span class="field-unit">°</span>
            </div>
            <p class="field-error" data-site-error hidden></p>
          </div>
        </div>
        <button type="button" class="pick-button" data-site-pick data-pick-what="${what}" aria-pressed="false"
          aria-label="Elegir en el mapa" title="Elegir en el mapa">${PIN_ICON}</button>
      </div>
    </div>`;
}

export interface SiteFields {
  /** Escribe las coordenadas de un punto elegido en el mapa o arrastrado (sin avisar a `onSite`). */
  show(site: LonLat): void;
  /** Nombre escrito; vacío si no hay. */
  getName(): string;
}

/**
 * Conecta los campos de `siteFieldsHtml`. `onSite` recibe el punto cuando las dos coordenadas son
 * válidas, o null cuando alguna falta o no sirve. Pegar "6.27940, -75.68530" en Latitud llena las dos.
 */
export function bindSiteFields(root: HTMLElement, onSite: (site: LonLat | null) => void): SiteFields {
  const nameInput = root.querySelector<HTMLInputElement>('[data-site-name]')!;
  const latInput = root.querySelector<HTMLInputElement>('[data-site-lat]')!;
  const lonInput = root.querySelector<HTMLInputElement>('[data-site-lon]')!;
  const error = root.querySelector<HTMLElement>('[data-site-error]')!;

  const showError = (message: string | null) => {
    error.hidden = !message;
    error.textContent = message ?? '';
  };

  function read() {
    const latText = latInput.value.trim();
    const lonText = lonInput.value.trim();
    const lat = parseDegrees(latText);
    const lon = parseDegrees(lonText);
    const latOk = lat !== null && isLatitude(lat);
    const lonOk = lon !== null && isLongitude(lon);
    latInput.setAttribute('aria-invalid', String(latText !== '' && !latOk));
    lonInput.setAttribute('aria-invalid', String(lonText !== '' && !lonOk));
    if (latOk && lonOk) {
      showError(null);
      onSite({ lat, lon });
      return;
    }
    showError(
      latText !== '' && !latOk
        ? 'La latitud va de −90 a 90 grados, por ejemplo 6.27940.'
        : lonText !== '' && !lonOk
          ? 'La longitud va de −180 a 180 grados, por ejemplo -75.68530.'
          : null,
    );
    onSite(null);
  }

  latInput.addEventListener('input', () => {
    const pair = parseLatLonPair(latInput.value);
    if (pair) {
      latInput.value = degrees(pair.lat);
      lonInput.value = degrees(pair.lon);
    }
    read();
  });
  lonInput.addEventListener('input', read);

  return {
    show(site) {
      latInput.value = degrees(site.lat);
      lonInput.value = degrees(site.lon);
      latInput.setAttribute('aria-invalid', 'false');
      lonInput.setAttribute('aria-invalid', 'false');
      showError(null);
    },
    getName: () => nameInput.value.trim(),
  };
}
