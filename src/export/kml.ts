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
  /** De 0 (transparente) a 1 (opaca); por omisión, opaca. */
  opacity?: number;
}

/** Tabla de la ficha de un punto: título opcional, encabezados opcionales y filas de texto. */
export interface KmlTable {
  title?: string;
  header?: string[];
  rows: string[][];
  /** Frase debajo de la tabla. */
  note?: string;
}

/** Punto con una ficha que Google Earth muestra al hacerle clic. */
export interface KmlPlacemark {
  name: string;
  position: LonLat;
  tables: KmlTable[];
}

/** Línea sobre el terreno, por ejemplo un contorno de servicio. */
export interface KmlLine {
  name: string;
  /** Color de la línea en "#rrggbb". */
  color: string;
  points: LonLat[];
}

export interface CoverageKmlOptions {
  /** Punto del sitio, fuera de la carpeta de cobertura: queda visible con cualquier capa. */
  site?: KmlPlacemark;
  /** Carpeta de líneas, también fuera de la de cobertura: se prenden aparte de la imagen. */
  lines?: { folderName: string; lines: KmlLine[] };
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const degrees = (value: number) => value.toFixed(6);

/** Color de KML (aabbggrr): blanco con la opacidad dada, que Google Earth multiplica por la imagen. */
export function kmlOpacityColor(opacity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return `${alpha.toString(16).padStart(2, '0')}ffffff`;
}

/** De "#rrggbb" al color de KML (aabbggrr), opaco: "#1a9850" → "ff50981a". */
export function kmlLineColor(hex: string): string {
  const rgb = hex.replace('#', '').toLowerCase();
  return `ff${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
}

/** Ancho de las líneas en Google Earth (píxeles). */
const LINE_WIDTH = 2;

function linesFolder(folderName: string, lines: readonly KmlLine[]): string {
  const items = lines.map(
    (l) => `
      <Placemark>
        <name>${escapeXml(l.name)}</name>
        <Style><LineStyle><color>${kmlLineColor(l.color)}</color><width>${LINE_WIDTH}</width></LineStyle></Style>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${l.points.map((p) => `${degrees(p.lon)},${degrees(p.lat)},0`).join(' ')}</coordinates>
        </LineString>
      </Placemark>`,
  );
  return `
    <Folder>
      <name>${escapeXml(folderName)}</name>${items.join('')}
    </Folder>`;
}

/**
 * Ficha en HTML. Va dentro de CDATA; como cada texto se escapa (« > » pasa a «&gt;»), ninguno
 * puede cerrarla antes de tiempo con «]]>».
 */
export function placemarkHtml(tables: readonly KmlTable[]): string {
  const cell = (tag: 'td' | 'th', text: string) => `<${tag}>${escapeXml(text)}</${tag}>`;
  return tables
    .map((t) => {
      const title = t.title ? `<h3>${escapeXml(t.title)}</h3>` : '';
      const header = t.header ? `<tr>${t.header.map((h) => cell('th', h)).join('')}</tr>` : '';
      const rows = t.rows.map((r) => `<tr>${r.map((c, i) => cell(i === 0 ? 'th' : 'td', c)).join('')}</tr>`).join('');
      const note = t.note ? `<p>${escapeXml(t.note)}</p>` : '';
      return `${title}<table>${header}${rows}</table>${note}`;
    })
    .join('');
}

function placemark(p: KmlPlacemark): string {
  return `
    <Placemark>
      <name>${escapeXml(p.name)}</name>
      <description><![CDATA[${placemarkHtml(p.tables)}]]></description>
      <Point><coordinates>${degrees(p.position.lon)},${degrees(p.position.lat)},0</coordinates></Point>
    </Placemark>`;
}

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
          <color>${kmlOpacityColor(layer.opacity ?? 1)}</color>
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
export function coverageKml(
  documentName: string,
  layers: readonly KmlCoverageLayer[],
  options: CoverageKmlOptions = {},
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <open>1</open>${options.site ? placemark(options.site) : ''}
    <Folder>
      <name>Cobertura</name>
      <open>1</open>
      <Style><ListStyle><listItemType>radioFolder</listItemType></ListStyle></Style>${layers.map((l, i) => layerFolder(l, i === 0)).join('')}
    </Folder>${options.lines ? linesFolder(options.lines.folderName, options.lines.lines) : ''}
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
