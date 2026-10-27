// Documento KML (Google Earth) con imágenes de cobertura georreferenciadas. Módulo puro.

import type { LonLat } from '../geo/geodesy';

export interface OverlayBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GroundOverlay {
  name: string;
  /** Ruta de la imagen dentro del KMZ, por ejemplo "bajada.png". */
  href: string;
  /** La imagen se estira en grados de latitud y longitud, sin proyección (no Web Mercator). */
  bounds: OverlayBounds;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const degrees = (value: number) => value.toFixed(6);

export function coverageKml(documentName: string, overlays: readonly GroundOverlay[]): string {
  const items = overlays.map(
    (o) => `
    <GroundOverlay>
      <name>${escapeXml(o.name)}</name>
      <Icon><href>${escapeXml(o.href)}</href></Icon>
      <LatLonBox>
        <north>${degrees(o.bounds.north)}</north>
        <south>${degrees(o.bounds.south)}</south>
        <east>${degrees(o.bounds.east)}</east>
        <west>${degrees(o.bounds.west)}</west>
      </LatLonBox>
    </GroundOverlay>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>${items.join('')}
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
