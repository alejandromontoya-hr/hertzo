import type { LonLat } from '../geo/geodesy';
import { elevationAt } from '../terrain/elevation';
import { formatMeters } from './format';

export interface SitePanel {
  /** Muestra la cota del terreno en el sitio y el botón del perfil. */
  showSite(site: LonLat): void;
  /** Cambia el botón y la ayuda según se esté trazando un perfil o no. */
  setProfileMode(active: boolean): void;
}

export function createSitePanel(root: HTMLElement, onProfileToggle: () => void): SitePanel {
  const details = root.querySelector<HTMLElement>('[data-site-details]')!;
  const elevation = root.querySelector<HTMLElement>('[data-site-elevation]')!;
  const profileButton = root.querySelector<HTMLButtonElement>('[data-profile-toggle]')!;
  const profileHint = root.querySelector<HTMLElement>('[data-profile-hint]')!;

  profileButton.addEventListener('click', onProfileToggle);

  // Si el usuario mueve el sitio antes de que llegue la cota anterior, esa respuesta se descarta.
  let request = 0;

  return {
    async showSite(site) {
      details.hidden = false;
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
