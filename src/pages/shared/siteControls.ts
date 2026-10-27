// Ubicación del sitio: nombre, coordenadas escritas o elegidas en el mapa, cota del terreno,
// perfil entre el sitio y otro punto, y radio de cálculo.

import type { LonLat } from '../../geo/geodesy';
import { createProfileTool } from '../../map/profileTool';
import { createSiteMarker } from '../../map/siteMarker';
import { loadTerrain } from '../../terrain/elevation';
import { profileBounds, sampleProfile } from '../../terrain/profile';
import { createNumberField } from '../../ui/fields';
import { createProfileChart } from '../../ui/profileChart';
import { createSitePanel } from '../../ui/sitePanel';
import { bindSiteFields } from '../../ui/siteFields';
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

/** Conecta el bloque `siteSectionHtml` con el mapa. */
export function createSiteControls(page: MapPage, options: SiteControlsOptions): SiteControls {
  const { map } = page;
  let site: LonLat | null = null;
  let radiusKm = options.radiusKm;
  let profileTarget: LonLat | null = null;
  let profileMode = false;
  let profileRequest = 0;

  const fields = bindSiteFields(page.find('[data-site-fields="site"]'), (next) => {
    if (next) marker.set(next);
    if (next || site) setSite(next);
  });
  const pickButton = page.find<HTMLButtonElement>('[data-pick-site]');

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
      fields.show(next);
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
      sitePanel.showSite(next);
      void updateProfile();
    }
    options.onChange();
  }

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
    getName: () => fields.getName(),
    getRadiusKm: () => radiusKm,
    setRadiusKm(km) {
      radiusKm = km;
      radiusField.setValue(km);
    },
  };
}
