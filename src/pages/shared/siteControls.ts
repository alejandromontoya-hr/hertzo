// Ubicación del sitio en el mapa, cota del terreno y perfil entre el sitio y otro punto.

import type { LonLat } from '../../geo/geodesy';
import { createProfileTool } from '../../map/profileTool';
import { enableSitePlacement } from '../../map/siteMarker';
import { loadTerrain } from '../../terrain/elevation';
import { profileBounds, sampleProfile } from '../../terrain/profile';
import { createNumberField } from '../../ui/fields';
import { createProfileChart } from '../../ui/profileChart';
import { createSitePanel } from '../../ui/sitePanel';
import type { MapPage } from './mapPage';

export interface SiteControls {
  getSite(): LonLat | null;
  getRadiusKm(): number;
  /** Cambia el radio de cálculo desde la página (por ejemplo al pasar de FM a AM). */
  setRadiusKm(km: number): void;
}

export interface SiteControlsOptions {
  radiusKm: number;
  maxRadiusKm: number;
  onChange(): void;
}

/** Conecta el bloque `siteSectionHtml` con el mapa: clic para ubicar, perfil y radio de cálculo. */
export function createSiteControls(page: MapPage, options: SiteControlsOptions): SiteControls {
  const { map } = page;
  let site: LonLat | null = null;
  let radiusKm = options.radiusKm;
  let profileTarget: LonLat | null = null;
  let profileMode = false;
  let profileRequest = 0;

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

  function setProfileMode(active: boolean) {
    profileMode = active;
    sitePanel.setProfileMode(active);
    if (!active) {
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
    } catch (error) {
      console.error(error);
      if (current === profileRequest) profileChart.showError('No se pudo descargar el terreno.');
    }
  }

  enableSitePlacement(
    map,
    (next) => {
      site = next;
      sitePanel.showSite(next);
      void updateProfile();
      options.onChange();
    },
    () => !profileMode,
  );

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
    getRadiusKm: () => radiusKm,
    setRadiusKm(km) {
      radiusKm = km;
      radiusField.setValue(km);
    },
  };
}
