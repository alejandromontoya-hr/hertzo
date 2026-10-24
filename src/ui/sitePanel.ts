import type { LonLat } from '../geo/geodesy';
import { elevationAt } from '../terrain/elevation';
import { formatLonLat, formatMeters } from './format';

export interface SitePanel {
  /** Muestra la ubicación del sitio y busca la cota del terreno en ese punto. */
  showSite(site: LonLat): void;
  /** Cambia el botón y la ayuda según se esté trazando un perfil o no. */
  setProfileMode(active: boolean): void;
}

export function createSitePanel(root: HTMLElement, onProfileToggle: () => void): SitePanel {
  const hint = root.querySelector<HTMLElement>('[data-site-hint]')!;
  const details = root.querySelector<HTMLElement>('[data-site-details]')!;
  const location = root.querySelector<HTMLElement>('[data-site-location]')!;
  const elevation = root.querySelector<HTMLElement>('[data-site-elevation]')!;
  const profileButton = root.querySelector<HTMLButtonElement>('[data-profile-toggle]')!;
  const profileHint = root.querySelector<HTMLElement>('[data-profile-hint]')!;

  profileButton.addEventListener('click', onProfileToggle);

  // Si el usuario mueve el sitio antes de que llegue la cota anterior, esa respuesta se descarta.
  let request = 0;

  return {
    async showSite(site) {
      hint.hidden = true;
      details.hidden = false;
      location.textContent = formatLonLat(site.lon, site.lat);
      elevation.textContent = 'Cargando…';

      const current = ++request;
      try {
        const meters = await elevationAt(site.lon, site.lat);
        if (current === request) elevation.textContent = formatMeters(meters);
      } catch (error) {
        console.error(error);
        if (current === request) elevation.textContent = 'No disponible (sin conexión al terreno)';
      }
    },
    setProfileMode(active) {
      profileButton.textContent = active ? 'Terminar perfil' : 'Ver perfil del terreno';
      profileButton.setAttribute('aria-pressed', String(active));
      profileHint.hidden = !active;
    },
  };
}
