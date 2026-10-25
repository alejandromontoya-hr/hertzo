import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { LonLat } from '../geo/geodesy';

/**
 * Un clic en el mapa ubica el sitio; el marcador se puede arrastrar después.
 * `onChange` se llama al ubicarlo y al soltarlo tras arrastrarlo.
 * Mientras `isActive()` sea falso (por ejemplo, al trazar un perfil) los clics se ignoran.
 */
export function enableSitePlacement(
  map: MapLibreMap,
  onChange: (site: LonLat) => void,
  isActive: () => boolean = () => true,
): void {
  let marker: Marker | undefined;

  const notify = () => {
    if (!marker) return;
    const { lng, lat } = marker.getLngLat();
    onChange({ lon: lng, lat });
  };

  map.on('click', (event) => {
    if (!isActive()) return;
    if (!marker) {
      // La punta del alfiler (anchor 'bottom') marca el punto exacto del sitio.
      marker = new Marker({ draggable: true, color: '#5b46f0', anchor: 'bottom' })
        .setLngLat(event.lngLat)
        .addTo(map);
      marker.on('dragend', notify);
    } else {
      marker.setLngLat(event.lngLat);
    }
    notify();
  });
}
