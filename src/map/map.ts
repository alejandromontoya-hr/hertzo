import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type IControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { TERRAIN_MAX_ZOOM, TERRARIUM_URL_TEMPLATE } from '../terrain/tiles';
import { BASEMAPS, BASEMAP_STORAGE_KEY, parseBasemap, type BasemapId } from './basemap';

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

/** Tratamiento del mapa de OpenStreetMap: apagado sobre el papel (Carta) o con sus colores (Color). */
const OSM_PAINT: Record<'carta' | 'color', { saturation: number; opacity: number; contrast: number }> = {
  carta: { saturation: -0.75, opacity: 0.8, contrast: -0.05 },
  color: { saturation: 0, opacity: 1, contrast: 0 },
};

function readBasemap(): BasemapId {
  try {
    return parseBasemap(localStorage.getItem(BASEMAP_STORAGE_KEY));
  } catch {
    return parseBasemap(null); // almacenamiento bloqueado: modo privado o sitio sin permisos
  }
}

function saveBasemap(id: BasemapId): void {
  try {
    localStorage.setItem(BASEMAP_STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento la elección dura solo mientras la página esté abierta.
  }
}

/** Estilo inicial con los tres mapas base cargados y visible solo el elegido. */
function buildStyle(basemap: BasemapId): StyleSpecification {
  const osm = OSM_PAINT[basemap === 'color' ? 'color' : 'carta'];
  const topo = basemap === 'topo';
  return {
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
      opentopomap: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 17,
        attribution:
          'Mapa topográfico: © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>), datos © <a href="https://www.openstreetmap.org/copyright" target="_blank">colaboradores de OpenStreetMap</a> y SRTM',
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
      { id: 'papel', type: 'background', paint: { 'background-color': '#f3f0e7' } },
      {
        id: 'mapa-base',
        type: 'raster',
        source: 'osm',
        layout: { visibility: topo ? 'none' : 'visible' },
        paint: { 'raster-saturation': osm.saturation, 'raster-opacity': osm.opacity, 'raster-contrast': osm.contrast },
      },
      // OpenTopoMap pinta la altura en verde, amarillo y rojo, los mismos colores de la cobertura;
      // se le baja el color para que la señal no se camufle entre las montañas.
      {
        id: 'mapa-topo',
        type: 'raster',
        source: 'opentopomap',
        layout: { visibility: topo ? 'visible' : 'none' },
        paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.85 },
      },
      // OpenTopoMap ya trae su propio sombreado; con el nuestro encima quedaría demasiado oscuro.
      {
        id: 'sombreado',
        type: 'hillshade',
        source: 'relieve',
        layout: { visibility: topo ? 'none' : 'visible' },
        paint: {
          'hillshade-exaggeration': 0.4,
          'hillshade-shadow-color': '#5a4a32',
          'hillshade-highlight-color': '#fbfaf6',
        },
      },
    ],
  };
}

/** Cambia el mapa base sin tocar las demás capas (la cobertura, el perfil, los marcadores). */
function applyBasemap(map: MapLibreMap, basemap: BasemapId): void {
  const topo = basemap === 'topo';
  map.setLayoutProperty('mapa-base', 'visibility', topo ? 'none' : 'visible');
  map.setLayoutProperty('mapa-topo', 'visibility', topo ? 'visible' : 'none');
  map.setLayoutProperty('sombreado', 'visibility', topo ? 'none' : 'visible');
  if (!topo) {
    const osm = OSM_PAINT[basemap];
    map.setPaintProperty('mapa-base', 'raster-saturation', osm.saturation);
    map.setPaintProperty('mapa-base', 'raster-opacity', osm.opacity);
    map.setPaintProperty('mapa-base', 'raster-contrast', osm.contrast);
  }
}

/** Botones Carta · Color · Topográfico en la esquina del mapa. */
class BasemapControl implements IControl {
  private container?: HTMLElement;

  constructor(private current: BasemapId) {}

  onAdd(map: MapLibreMap): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl basemap-control';
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-label', 'Mapa base');
    container.innerHTML = BASEMAPS.map(
      (b) =>
        `<button type="button" role="radio" data-basemap="${b.id}" title="${b.description}" aria-checked="${b.id === this.current}">${b.label}</button>`,
    ).join('');
    container.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-basemap]');
      if (!button) return;
      const id = parseBasemap(button.dataset.basemap);
      if (id === this.current) return;
      this.current = id;
      applyBasemap(map, id);
      saveBasemap(id);
      for (const b of container.querySelectorAll<HTMLButtonElement>('[data-basemap]')) {
        b.setAttribute('aria-checked', String(b.dataset.basemap === id));
      }
    });
    this.container = container;
    return container;
  }

  onRemove(): void {
    this.container?.remove();
  }
}

export function createMap(container: HTMLElement): MapLibreMap {
  const basemap = readBasemap();
  const map = new MapLibreMap({
    container,
    style: buildStyle(basemap),
    center: ANTIOQUIA_CENTER,
    zoom: ANTIOQUIA_ZOOM,
    locale: SPANISH_LOCALE,
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new BasemapControl(basemap), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');  return map;
}
