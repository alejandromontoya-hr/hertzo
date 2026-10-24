import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { TERRAIN_MAX_ZOOM, TERRARIUM_URL_TEMPLATE } from '../terrain/tiles';

// MapLibre 6 busca su hilo de trabajo junto a su propio archivo, y Vite lo mueve al
// empaquetar; sin esto el relieve y las capas no cargan.
setWorkerUrl(mapLibreWorkerUrl);

/** Vista inicial: departamento de Antioquia, Colombia. */
const ANTIOQUIA_CENTER: [number, number] = [-75.5, 7.0];
const ANTIOQUIA_ZOOM = 7.3;

const SPANISH_LOCALE: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar créditos',
  'AttributionControl.MapFeedback': 'Reportar un error del mapa',
  'Map.Title': 'Mapa',
  'Marker.Title': 'Sitio',
  'NavigationControl.ResetBearing': 'Orientar al norte',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'Popup.Close': 'Cerrar',
};

const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank">colaboradores de OpenStreetMap</a>',
    },
    relieve: {
      type: 'raster-dem',
      tiles: [TERRARIUM_URL_TEMPLATE],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: TERRAIN_MAX_ZOOM,
      attribution:
        'Relieve: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a> (SRTM y GMTED2010 de USGS, y otras fuentes; ver Créditos)',
    },
  },
  layers: [
    { id: 'mapa-base', type: 'raster', source: 'osm' },
    {
      id: 'sombreado',
      type: 'hillshade',
      source: 'relieve',
      paint: {
        'hillshade-exaggeration': 0.4,
        'hillshade-shadow-color': '#3b3b3b',
      },
    },
  ],
};

export function createMap(container: HTMLElement): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style,
    center: ANTIOQUIA_CENTER,
    zoom: ANTIOQUIA_ZOOM,
    locale: SPANISH_LOCALE,
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
  return map;
}
