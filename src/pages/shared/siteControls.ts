// Ubicación del sitio: nombre, coordenadas escritas o elegidas en el mapa, cota del terreno,
// perfil entre el sitio y otro punto, y radio de cálculo.

import { isLatitude, isLongitude, parseDegrees, parseLatLonPair } from '../../geo/coordinates';
import type { LonLat } from '../../geo/geodesy';
import { createProfileTool } from '../../map/profileTool';
import { createSiteMarker } from '../../map/siteMarker';
import { loadTerrain } from '../../terrain/elevation';
import { profileBounds, sampleProfile } from '../../terrain/profile';
import { createNumberField } from '../../ui/fields';
import { createProfileChart } from '../../ui/profileChart';
import { createSitePanel } from '../../ui/sitePanel';
import type { MapPage } from './mapPage';

export interface SiteControls {
  /** El sitio, o null si las coordenadas están vacías o no son válidas. */
  getSite(): LonLat | null;
  /** Nombre que el usuario le dio al sitio; vacío si no le puso. */
  getName(): string;
  getRadiusKm(): number;
  /** Cambia el radio de cálculo desde la página (por ejemplo al pasar de FM a AM). */
  setRadiusKm(km: number): void;
}

export interface SiteControlsOptions {
  radiusKm: number;
  maxRadiusKm: number;
  /** Cambió algo que afecta el cálculo: el sitio o el radio. */
  onChange(): void;
}

/** Coordenadas con 5 decimales (≈ 1 m), con punto, como las muestra un GPS. */
const degrees = (v: number) => v.toFixed(5);

/** Conecta el bloque `siteSectionHtml` con el mapa. */
export function createSiteControls(page: MapPage, options: SiteControlsOptions): SiteControls {
  const { map } = page;
  let site: LonLat | null = null;
  let name = '';
  let radiusKm = options.radiusKm;
  let profileTarget: LonLat | null = null;
  let profileMode = false;
  let profileRequest = 0;

  const nameInput = page.find<HTMLInputElement>('[data-site-name]');
  const latInput = page.find<HTMLInputElement>('[data-site-lat]');
  const lonInput = page.find<HTMLInputElement>('[data-site-lon]');
  const error = page.find('[data-site-error]');
  const pickButton = page.find<HTMLButtonElement>('[data-pick-site]');
  const hint = page.find('[data-site-hint]');

  const sitePanel = createSitePanel(page.find('[data-site-panel]'), () => setProfileMode(!profileMode));
  const profileTool = createProfileTool(
    map,
    (target) => {
      profileTarget = target;
      void updateProfile();
    },
    () => profileMode,
  );
  const profileChart = createProfileChart(
    page.profileRoot,
    (point) => profileTool.setHover(point),
    () => setProfileMode(false),
  );

  const marker = createSiteMarker(
    map,
    (next) => {
      latInput.value = degrees(next.lat);
      lonInput.value = degrees(next.lon);
      showError(null);
      setSite(next);
    },
    (active) => {
      pickButton.setAttribute('aria-pressed', String(active));
      pickButton.textContent = active ? 'Haz clic en el mapa…' : 'Elegir en el mapa';
    },
  );

  function setProfileMode(active: boolean) {
    profileMode = active;
    sitePanel.setProfileMode(active);
    if (active) marker.setPicking(false);
    else {
      profileRequest++;
      profileTarget = null;
      profileTool.clear();
      profileChart.hide();
    }
  }

  async function updateProfile() {
    if (!site || !profileTarget) return;
    const from = site;
    const to = profileTarget;
    const current = ++profileRequest;
    profileTool.setLine(from, to);
    profileChart.showLoading();
    try {
      const sampler = await loadTerrain(profileBounds(from, to));
      if (current === profileRequest) profileChart.show(sampleProfile(sampler, from, to));
    } catch (err) {
      console.error(err);
      if (current === profileRequest) profileChart.showError('No se pudo descargar el terreno.');
    }
  }

  function setSite(next: LonLat | null) {
    site = next;
    if (next) {
      hint.hidden = true;
      sitePanel.showSite(next);
      void updateProfile();
    }
    options.onChange();
  }

  function showError(message: string | null) {
    error.hidden = !message;
    error.textContent = message ?? '';
  }

  /** Lee los dos campos; mueve el marcador si son válidos y avisa qué falta si no. */
  function readInputs() {
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
      marker.set({ lat, lon });
      setSite({ lat, lon });
      return;
    }
    showError(
      latText !== '' && !latOk
        ? 'La latitud va de −90 a 90 grados, por ejemplo 6.27940.'
        : lonText !== '' && !lonOk
          ? 'La longitud va de −180 a 180 grados, por ejemplo -75.68530.'
          : null,
    );
    if (site) setSite(null);
  }

  latInput.addEventListener('input', () => {
    // Pegar «6.27940, -75.68530» en Latitud llena los dos campos.
    const pair = parseLatLonPair(latInput.value);
    if (pair) {
      latInput.value = degrees(pair.lat);
      lonInput.value = degrees(pair.lon);
    }
    readInputs();
  });
  lonInput.addEventListener('input', readInputs);
  nameInput.addEventListener('input', () => (name = nameInput.value.trim()));

  pickButton.addEventListener('click', () => {
    const active = pickButton.getAttribute('aria-pressed') !== 'true';
    if (active) setProfileMode(false);
    marker.setPicking(active);
  });

  const radiusField = createNumberField(
    { key: 'radiusKm', label: 'Radio de cálculo', unit: 'km', min: 1, max: options.maxRadiusKm },
    radiusKm,
    (value) => {
      radiusKm = value;
      options.onChange();
    },
  );
  page.find('[data-radius-field]').append(radiusField.element);

  return {
    getSite: () => site,
    getName: () => name,
    getRadiusKm: () => radiusKm,
    setRadiusKm(km) {
      radiusKm = km;
      radiusField.setValue(km);
    },
  };
}
