// Documento KML (Google Earth) con imágenes de cobertura georreferenciadas. Módulo puro.

import type { LonLat } from '../geo/geodesy';

export interface OverlayBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface KmlLegend {
  /** Ruta de la imagen dentro del KMZ, por ejemplo "leyenda-bajada.png". */
  href: string;
  /** Tamaño en pantalla (píxeles); la imagen puede tener el doble para verse nítida. */
  width: number;
  height: number;
}

export interface KmlCoverageLayer {
  /** Nombre de la carpeta, por ejemplo "Bajada · 860 MHz". */
  name: string;
  /** Ruta de la imagen de cobertura dentro del KMZ, por ejemplo "bajada.png". */
  href: string;
  /** La imagen se estira en grados de latitud y longitud, sin proyección (no Web Mercator). */
  bounds: OverlayBounds;
  /** Leyenda fija en la esquina inferior izquierda mientras la capa está prendida. */
  legend?: KmlLegend;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const degrees = (value: number) => value.toFixed(6);

/** Separación de la leyenda desde la esquina inferior izquierda (píxeles), por encima de la barra de estado. */
const LEGEND_MARGIN_X = 10;
const LEGEND_MARGIN_Y = 40;

function layerFolder(layer: KmlCoverageLayer, visible: boolean): string {
  const visibility = `<visibility>${visible ? 1 : 0}</visibility>`;
  const legend = layer.legend
    ? `
        <ScreenOverlay>
          <name>Leyenda</name>
          ${visibility}
          <Icon><href>${escapeXml(layer.legend.href)}</href></Icon>
          <overlayXY x="0" y="0" xunits="fraction" yunits="fraction"/>
          <screenXY x="${LEGEND_MARGIN_X}" y="${LEGEND_MARGIN_Y}" xunits="pixels" yunits="pixels"/>
          <size x="${layer.legend.width}" y="${layer.legend.height}" xunits="pixels" yunits="pixels"/>
        </ScreenOverlay>`
    : '';
  return `
      <Folder>
        <name>${escapeXml(layer.name)}</name>
        ${visibility}
        <GroundOverlay>
          <name>Cobertura</name>
          ${visibility}
          <Icon><href>${escapeXml(layer.href)}</href></Icon>
          <LatLonBox>
            <north>${degrees(layer.bounds.north)}</north>
            <south>${degrees(layer.bounds.south)}</south>
            <east>${degrees(layer.bounds.east)}</east>
            <west>${degrees(layer.bounds.west)}</west>
          </LatLonBox>
        </GroundOverlay>${legend}
      </Folder>`;
}

/**
 * Cada capa va en su carpeta, dentro de una carpeta «Cobertura» en la que se prende una a la
 * vez, como el selector del mapa de Hertzo. Empieza prendida la primera.
 */
export function coverageKml(documentName: string, layers: readonly KmlCoverageLayer[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <open>1</open>
    <Folder>
      <name>Cobertura</name>
      <open>1</open>
      <Style><ListStyle><listItemType>radioFolder</listItemType></ListStyle></Style>${layers.map((l, i) => layerFolder(l, i === 0)).join('')}
    </Folder>
  </Document>
</kml>
`;
}

/** Nombre del archivo: escenario, banda y ubicación del sitio, por ejemplo hertzo-terreno-800MHz-6.2794N-75.6853W.kmz. */
export function exportFileName(scenario: string, bandLabel: string, site: LonLat, extension: string): string {
  const lat = `${Math.abs(site.lat).toFixed(4)}${site.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(site.lon).toFixed(4)}${site.lon >= 0 ? 'E' : 'W'}`;
  return `hertzo-${scenario}-${bandLabel.replace(/\s+/g, '')}-${lat}-${lon}.${extension}`;
}
