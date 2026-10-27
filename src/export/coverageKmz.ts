// Del navegador: arma y descarga el KMZ de cobertura de una página con mapa. Cada página dice
// qué capas lleva y cómo pintarlas; aquí se repintan en grados parejos para Google Earth, se
// dibujan las leyendas y se empaqueta todo.

import type { RadialPlan } from '../coverage/radials';
import { buildRasterGeometry, type RasterGeometry } from '../coverage/raster';
import { encodePng, saveFile } from './download';
import { coverageKml, type CoverageKmlOptions, type KmlCoverageLayer, type KmlPlacemark } from './kml';
import { drawLegendImage, type LegendImageContent } from './legendImage';
import { zipStore, type ZipEntry } from './zip';

const KMZ_MIME = 'application/vnd.google-earth.kmz';

export interface KmzLayerSpec {
  /** Nombre de la carpeta en Google Earth, por ejemplo «Bajada · 860 MHz». */
  name: string;
  /** Nombre de la imagen sin extensión, por ejemplo "bajada"; la leyenda va en "leyenda-bajada.png". */
  file: string;
  /** Pinta la capa (RGBA, fila por fila) sobre la cuadrícula dada, como se pinta sobre el mapa. */
  paint(geometry: RasterGeometry, out: Uint8ClampedArray<ArrayBuffer>): void;
  legend: Omit<LegendImageContent, 'heading'>;
}

export interface KmzSpec {
  documentName: string;
  fileName: string;
  plan: RadialPlan;
  layers: KmzLayerSpec[];
  /** Opacidad del mapa, de 0 a 1. */
  opacity: number;
  site?: KmlPlacemark;
  lines?: CoverageKmlOptions['lines'];
}

/** Cuadrícula en grados parejos de cada cálculo: se arma en la primera exportación y se reusa. */
const geographicGeometries = new WeakMap<RadialPlan, RasterGeometry>();

function geographicGeometry(plan: RadialPlan): RasterGeometry {
  let geometry = geographicGeometries.get(plan);
  if (!geometry) {
    geometry = buildRasterGeometry(plan, 'geographic');
    geographicGeometries.set(plan, geometry);
  }
  return geometry;
}

export async function downloadCoverageKmz(spec: KmzSpec): Promise<void> {
  const g = geographicGeometry(spec.plan);
  const [[west, north], , [east, south]] = g.coordinates;
  const files: ZipEntry[] = [];
  const layers: KmlCoverageLayer[] = [];

  for (const layer of spec.layers) {
    const image = new Uint8ClampedArray(g.width * g.height * 4);
    layer.paint(g, image);
    const legend = await drawLegendImage({ heading: layer.name, ...layer.legend });
    files.push(
      { name: `${layer.file}.png`, data: await encodePng(image, g.width, g.height) },
      { name: `leyenda-${layer.file}.png`, data: legend.png },
    );
    layers.push({
      name: layer.name,
      href: `${layer.file}.png`,
      bounds: { north, south, east, west },
      opacity: spec.opacity,
      legend: { href: `leyenda-${layer.file}.png`, width: legend.width, height: legend.height },
    });
  }

  const kml = coverageKml(spec.documentName, layers, { site: spec.site, lines: spec.lines });
  saveFile(zipStore([{ name: 'doc.kml', data: new TextEncoder().encode(kml) }, ...files]), spec.fileName, KMZ_MIME);
}

/** Botón de exportar: se apaga mientras arma el archivo para no descargarlo dos veces. */
export function bindExportButton(button: HTMLButtonElement, exportFile: () => Promise<void>): void {
  button.addEventListener('click', () => {
    button.disabled = true;
    exportFile()
      .catch((error) => console.error(error))
      .finally(() => (button.disabled = false));
  });
}

/** Botón para el bloque de cobertura del panel; empieza oculto hasta que hay un cálculo. */
export const KMZ_BUTTON_HTML =
  '<button type="button" class="button" data-export-kmz hidden title="Para abrir en Google Earth">Exportar KMZ</button>';
