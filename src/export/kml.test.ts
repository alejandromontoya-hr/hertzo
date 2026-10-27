import { describe, expect, it } from 'vitest';
import { coverageKml, exportFileName } from './kml';

describe('coverageKml', () => {
  const kml = coverageKml('Hertzo · Terreno 800 MHz', [
    { name: 'Bajada', href: 'bajada.png', bounds: { north: 7.1787, south: 5.3801, east: -74.7811, west: -76.5895 } },
  ]);

  it('es un documento KML 2.2 con el nombre dado', () => {
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>Hertzo · Terreno 800 MHz</name>');
  });

  it('pone la imagen sobre el rectángulo norte, sur, este y oeste, con 6 decimales', () => {
    expect(kml).toContain('<href>bajada.png</href>');
    expect(kml).toContain('<north>7.178700</north>');
    expect(kml).toContain('<south>5.380100</south>');
    expect(kml).toContain('<east>-74.781100</east>');
    expect(kml).toContain('<west>-76.589500</west>');
  });

  it('escapa los caracteres especiales de XML en los nombres', () => {
    expect(coverageKml('A & B <C>', [])).toContain('<name>A &amp; B &lt;C&gt;</name>');
  });
});

describe('exportFileName', () => {
  it('Medellín (6,2794 N; 75,6853 O) en 800 MHz', () => {
    expect(exportFileName('terreno', '800 MHz', { lon: -75.6853, lat: 6.2794 }, 'kmz')).toBe(
      'hertzo-terreno-800MHz-6.2794N-75.6853W.kmz',
    );
  });

  it('Buenos Aires (34,6037 S; 58,3816 O) en VHF', () => {
    expect(exportFileName('terreno', 'VHF', { lon: -58.3816, lat: -34.6037 }, 'kmz')).toBe(
      'hertzo-terreno-VHF-34.6037S-58.3816W.kmz',
    );
  });

  it('Tokio (35,6762 N; 139,6503 E) en UHF', () => {
    expect(exportFileName('terreno', 'UHF', { lon: 139.6503, lat: 35.6762 }, 'kmz')).toBe(
      'hertzo-terreno-UHF-35.6762N-139.6503E.kmz',
    );
  });
});
