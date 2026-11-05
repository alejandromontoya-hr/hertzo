import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl';
import type { RasterGeometry } from '../coverage/raster';

const SOURCE_ID = 'cobertura';
/** Capas que deben quedar encima de la cobertura (línea del perfil y punto bajo el cursor). */
const LAYERS_ABOVE = ['perfil-linea', 'perfil-cursor'];

export interface CoverageLayer {
  /** Muestra la imagen (RGBA) sobre el rectángulo de la geometría. */
  draw(geometry: RasterGeometry, pixels: Uint8ClampedArray<ArrayBuffer>): void;
  setOpacity(opacity: number): void;
  /** Quita la imagen del mapa (por ejemplo al cambiar de servicio). */
  clear(): void;
}

/** Capa de cobertura: un lienzo que MapLibre dibuja georreferenciado sobre el mapa. */
export function createCoverageLayer(map: MapLibreMap, initialOpacity: number): CoverageLayer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let opacity = initialOpacity;
  let waitingForStyle = false;
  let latest: RasterGeometry | null = null;

  /** Pone en el mapa el lienzo ya pintado, sobre el rectángulo de la geometría. */
  function show(geometry: RasterGeometry) {
    const source = map.getSource<CanvasSource>(SOURCE_ID);
    if (!source) {
      try {
        map.addSource(SOURCE_ID, { type: 'canvas', canvas, coordinates: geometry.coordinates, animate: false });
      } catch {
        // Si el cálculo termina antes de que el mapa cargue su estilo (terreno en caché y mapa
        // base lento), MapLibre todavía no admite capas: se muestra apenas cargue, con el último lienzo.
        if (!waitingForStyle) {
          waitingForStyle = true;
          map.once('style.load', () => {
            waitingForStyle = false;
            if (latest) show(latest);
          });
        }
        return;
      }
      map.addLayer(
        {
          id: SOURCE_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
        },
        LAYERS_ABOVE.find((id) => map.getLayer(id)),
      );
      return;
    }
    source.setCoordinates(geometry.coordinates);
    // Un lienzo estático solo se vuelve a subir mientras "reproduce": se activa un cuadro.
    source.play();
    map.once('render', () => source.pause());
  }

  const layer: CoverageLayer = {
    draw(geometry, pixels) {
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      ctx.putImageData(new ImageData(pixels, geometry.width, geometry.height), 0, 0);
      latest = geometry;
      show(geometry);
    },
    setOpacity(next) {
      opacity = next;
      if (map.getLayer(SOURCE_ID)) map.setPaintProperty(SOURCE_ID, 'raster-opacity', opacity);
    },
    clear() {
      if (map.getLayer(SOURCE_ID)) map.removeLayer(SOURCE_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    },
  };
  return layer;
}
