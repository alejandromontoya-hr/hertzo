import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import type { LonLat } from '../geo/geodesy';

const LINE_SOURCE = 'perfil-linea';
const HOVER_SOURCE = 'perfil-cursor';

export interface ProfileTool {
  /** Muestra la línea entre el sitio y el otro extremo. */
  setLine(from: LonLat, to: LonLat): void;
  /** Señala en el mapa el punto del perfil que está bajo el cursor de la gráfica. */
  setHover(point: LonLat | null): void;
  /** Quita el marcador del otro extremo, la línea y el punto señalado. */
  clear(): void;
}

const emptyCollection: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Herramienta de perfil: mientras `isActive()` sea verdadero, un clic pone (o mueve) el
 * otro extremo del perfil, que también se puede arrastrar.
 */
export function createProfileTool(
  map: MapLibreMap,
  onTargetChange: (target: LonLat) => void,
  isActive: () => boolean,
): ProfileTool {
  let marker: Marker | undefined;

  const ensureLayers = () => {
    if (map.getSource(LINE_SOURCE)) return;
    map.addSource(LINE_SOURCE, { type: 'geojson', data: emptyCollection });
    map.addSource(HOVER_SOURCE, { type: 'geojson', data: emptyCollection });
    map.addLayer({
      id: LINE_SOURCE,
      type: 'line',
      source: LINE_SOURCE,
      paint: { 'line-color': '#b54708', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
    });
    map.addLayer({
      id: HOVER_SOURCE,
      type: 'circle',
      source: HOVER_SOURCE,
      paint: {
        'circle-radius': 6,
        'circle-color': '#b54708',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  };

  const setData = (source: string, data: FeatureCollection | Feature) => {
    ensureLayers();
    map.getSource<GeoJSONSource>(source)?.setData(data);
  };

  const notify = () => {
    if (!marker) return;
    const { lng, lat } = marker.getLngLat();
    onTargetChange({ lon: lng, lat });
  };

  map.on('click', (event) => {
    if (!isActive()) return;
    if (!marker) {
      marker = new Marker({ draggable: true, color: '#b54708', anchor: 'bottom' })
        .setLngLat(event.lngLat)
        .addTo(map);
      marker.on('dragend', notify);
    } else {
      marker.setLngLat(event.lngLat);
    }
    notify();
  });

  return {
    setLine(from, to) {
      setData(LINE_SOURCE, {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
      });
    },
    setHover(point) {
      setData(
        HOVER_SOURCE,
        point
          ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [point.lon, point.lat] } }
          : emptyCollection,
      );
    },
    clear() {
      marker?.remove();
      marker = undefined;
      if (map.getSource(LINE_SOURCE)) {
        setData(LINE_SOURCE, emptyCollection);
        setData(HOVER_SOURCE, emptyCollection);
      }
    },
  };
}
