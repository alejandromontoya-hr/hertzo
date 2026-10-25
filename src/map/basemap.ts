// Mapas base que el usuario puede elegir y cómo se recuerda su elección. Módulo puro.

export type BasemapId = 'carta' | 'color' | 'topo';

export interface BasemapOption {
  id: BasemapId;
  label: string;
  description: string;
}

export const BASEMAPS: readonly BasemapOption[] = [
  { id: 'carta', label: 'Carta', description: 'Mapa apagado en tonos crema: resalta la cobertura' },
  { id: 'color', label: 'Color', description: 'OpenStreetMap con sus colores normales' },
  { id: 'topo', label: 'Topográfico', description: 'OpenTopoMap: curvas de nivel y relieve' },
];

export const DEFAULT_BASEMAP: BasemapId = 'carta';

/** Clave con la que se guarda la elección en el navegador, para todas las páginas con mapa. */
export const BASEMAP_STORAGE_KEY = 'hertzo.mapaBase';

/** Valor guardado → mapa base; cualquier valor desconocido o vacío vuelve al de por defecto. */
export function parseBasemap(value: string | null | undefined): BasemapId {
  return BASEMAPS.some((b) => b.id === value) ? (value as BasemapId) : DEFAULT_BASEMAP;
}
