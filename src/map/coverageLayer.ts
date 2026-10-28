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

  return {
    draw(geometry, pixels) {
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      ctx.putImageData(new ImageData(pixels, geometry.width, geometry.height), 0, 0);

      const source = map.getSource<CanvasSource>(SOURCE_ID);
      if (!source) {
        map.addSource(SOURCE_ID, { type: 'canvas', canvas, coordinates: geometry.coordinates, animate: false });
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
}
