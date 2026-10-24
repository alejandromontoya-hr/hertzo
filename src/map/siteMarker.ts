import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

export interface LonLat {
  lon: number;
  lat: number;
}

/**
 * Un clic en el mapa ubica el sitio; el marcador se puede arrastrar después.
 * `onChange` se llama al ubicarlo y al soltarlo tras arrastrarlo.
 */
export function enableSitePlacement(map: MapLibreMap, onChange: (site: LonLat) => void): void {
  let marker: Marker | undefined;

  const notify = () => {
    if (!marker) return;
    const { lng, lat } = marker.getLngLat();
    onChange({ lon: lng, lat });
  };

  map.on('click', (event) => {
    if (!marker) {
      // La punta del alfiler (anchor 'bottom') marca el punto exacto del sitio.
      marker = new Marker({ draggable: true, color: '#0b6e99', anchor: 'bottom' })
        .setLngLat(event.lngLat)
        .addTo(map);
      marker.on('dragend', notify);
    } else {
      marker.setLngLat(event.lngLat);
    }
    notify();
  });
}
