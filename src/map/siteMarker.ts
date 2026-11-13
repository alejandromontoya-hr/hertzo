import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { LonLat } from '../geo/geodesy';
import { SITE_ICON } from '../ui/icons';

export interface SiteMarker {
  /** Pone (o mueve) el marcador en el sitio, por ejemplo al escribir las coordenadas. */
  set(site: LonLat): void;
  /** Activa o desactiva "Elegir en el mapa": el próximo clic ubica el sitio y lo desactiva. */
  setPicking(active: boolean): void;
}

/**
 * Marcador del sitio. Solo un clic con "Elegir en el mapa" activo lo ubica; después se puede
 * arrastrar. `onChange` se llama al ubicarlo con un clic y al soltarlo tras arrastrarlo.
 */
export function createSiteMarker(
  map: MapLibreMap,
  onChange: (site: LonLat) => void,
  onPickingChange: (active: boolean) => void,
): SiteMarker {
  let marker: Marker | undefined;
  let picking = false;

  const place = (site: LonLat) => {
    if (!marker) {
      // Una torre dentro del alfiler; la punta (anchor 'bottom') marca el punto exacto del sitio.
      const element = document.createElement('div');
      element.className = 'site-pin';
      element.innerHTML = `<span class="site-pin-head">${SITE_ICON}</span>`;
      marker = new Marker({ element, draggable: true, anchor: 'bottom' }).setLngLat([site.lon, site.lat]).addTo(map);
      marker.on('dragend', () => {
        const { lng, lat } = marker!.getLngLat();
        onChange({ lon: lng, lat });
      });
    } else {
      marker.setLngLat([site.lon, site.lat]);
    }
  };

  const setPicking = (active: boolean) => {
    picking = active;
    map.getCanvas().style.cursor = active ? 'crosshair' : '';
    onPickingChange(active);
  };

  map.on('click', (event) => {
    if (!picking) return;
    const site = { lon: event.lngLat.lng, lat: event.lngLat.lat };
    place(site);
    setPicking(false);
    onChange(site);
  });

  return {
    set(site) {
      place(site);
      // Si el sitio queda fuera de la vista, el mapa lo lleva al centro.
      if (!map.getBounds().contains([site.lon, site.lat])) map.easeTo({ center: [site.lon, site.lat] });
    },
    setPicking,
  };
}
