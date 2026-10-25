import {
  AttributionControl,
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

const LAYERS_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12 9.5 5 9.5-5"/><path d="m2.5 16 9.5 5 9.5-5"/></svg>';

/** Botón flotante abajo a la derecha: al abrirlo, elige el mapa base y lleva a los créditos. */
class MapMenuControl implements IControl {
  private container?: HTMLElement;
  private closeOnOutsideClick?: (event: MouseEvent) => void;

  constructor(private current: BasemapId) {}

  onAdd(map: MapLibreMap): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl map-menu';
    container.innerHTML = `
      <div class="map-menu-panel" id="map-menu-panel" hidden>
        <p class="map-menu-title" id="map-menu-basemap">Mapa base</p>
        <div role="radiogroup" aria-labelledby="map-menu-basemap">
          ${BASEMAPS.map(
            (b) => `
            <button type="button" role="radio" class="map-menu-option" data-basemap="${b.id}" aria-checked="${b.id === this.current}">
              <span class="map-menu-check" aria-hidden="true"></span>
              <span><strong>${b.label}</strong><small>${b.description}</small></span>
            </button>`,
          ).join('')}
        </div>
        <p class="map-menu-title">Información</p>
        <button type="button" class="map-menu-link" data-map-credits>Créditos y licencias</button>
        <a class="map-menu-link" href="https://github.com/alejandromontoya-hr/hertzo" target="_blank" rel="noopener">Código abierto (MIT) ↗</a>
      </div>
      <button type="button" class="map-menu-toggle" aria-expanded="false" aria-controls="map-menu-panel" aria-label="Mapa base e información">${LAYERS_ICON}</button>`;

    const panel = container.querySelector<HTMLElement>('.map-menu-panel')!;
    const toggle = container.querySelector<HTMLButtonElement>('.map-menu-toggle')!;
    const setOpen = (open: boolean) => {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
    panel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-map-credits]')) {
        setOpen(false);
        document.querySelector<HTMLDialogElement>('#credits')?.showModal();
        return;
      }
      const option = target.closest<HTMLButtonElement>('[data-basemap]');
      if (!option) return;
      const id = parseBasemap(option.dataset.basemap);
      if (id !== this.current) {
        this.current = id;
        applyBasemap(map, id);
        saveBasemap(id);
        for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-basemap]')) {
          b.setAttribute('aria-checked', String(b.dataset.basemap === id));
        }
      }
      setOpen(false);
    });
    this.closeOnOutsideClick = (event) => {
      if (!container.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', this.closeOnOutsideClick);

    this.container = container;
    return container;
  }

  onRemove(): void {
    if (this.closeOnOutsideClick) document.removeEventListener('click', this.closeOnOutsideClick);
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
    attributionControl: false,
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new MapMenuControl(basemap), 'bottom-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
  // OpenStreetMap exige que su crédito se vea en el mapa: queda abajo a la izquierda, junto a la escala.
  map.addControl(new AttributionControl(), 'bottom-left');  return map;
}
