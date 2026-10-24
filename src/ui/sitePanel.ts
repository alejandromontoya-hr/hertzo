import type { LonLat } from '../map/siteMarker';
import { elevationAt } from '../terrain/elevation';
import { formatLonLat, formatMeters } from './format';

/** Muestra la ubicación del sitio y la cota del terreno en ese punto. */
export function createSitePanel(root: HTMLElement): (site: LonLat) => void {
  const hint = root.querySelector<HTMLElement>('[data-site-hint]')!;
  const details = root.querySelector<HTMLElement>('[data-site-details]')!;
  const location = root.querySelector<HTMLElement>('[data-site-location]')!;
  const elevation = root.querySelector<HTMLElement>('[data-site-elevation]')!;

  // Si el usuario mueve el sitio antes de que llegue la cota anterior, esa respuesta se descarta.
  let request = 0;

  return async (site) => {
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
  };
}
