import { describe, expect, it } from 'vitest';
import { coverageKml, exportFileName } from './kml';

describe('coverageKml', () => {
  // Sitio en Medellín con 100 km de radio, en 800 MHz: bajada en 860 MHz y subida en 815 MHz.
  const bounds = { north: 7.1787, south: 5.3801, east: -74.7811, west: -76.5895 };
  const kml = coverageKml('Hertzo · Terreno 800 MHz', [
    { name: 'Bajada · 860 MHz', href: 'bajada.png', bounds, legend: { href: 'leyenda-bajada.png', width: 260, height: 150 } },
    { name: 'Subida · 815 MHz', href: 'subida.png', bounds, legend: { href: 'leyenda-subida.png', width: 260, height: 150 } },
  ]);
  /** Texto de la carpeta de una capa, desde su nombre hasta el cierre. */
  const folder = (name: string) => kml.slice(kml.indexOf(`<name>${name}</name>`), kml.indexOf('</Folder>', kml.indexOf(`<name>${name}</name>`)));

  it('es un documento KML 2.2 con el nombre dado', () => {
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>Hertzo · Terreno 800 MHz</name>');
  });

  it('las capas van en una carpeta «Cobertura» donde se prende una a la vez', () => {
    expect(kml).toContain('<name>Cobertura</name>');
    expect(kml).toContain('<listItemType>radioFolder</listItemType>');
  });

  it('la bajada empieza prendida y la subida apagada, con todo lo que llevan adentro', () => {
    expect(folder('Bajada · 860 MHz').match(/<visibility>1<\/visibility>/g)).toHaveLength(3);
    expect(folder('Subida · 815 MHz').match(/<visibility>0<\/visibility>/g)).toHaveLength(3);
  });

  it('cada carpeta pone su imagen sobre el rectángulo norte, sur, este y oeste, con 6 decimales', () => {
    const subida = folder('Subida · 815 MHz');
    expect(subida).toContain('<href>subida.png</href>');
    expect(subida).toContain('<north>7.178700</north>');
    expect(subida).toContain('<south>5.380100</south>');
    expect(subida).toContain('<east>-74.781100</east>');
    expect(subida).toContain('<west>-76.589500</west>');
  });

  it('cada carpeta lleva su leyenda de 260 × 150 píxeles en la esquina inferior izquierda', () => {
    const bajada = folder('Bajada · 860 MHz');
    expect(bajada).toContain('<href>leyenda-bajada.png</href>');
    expect(bajada).toContain('<overlayXY x="0" y="0" xunits="fraction" yunits="fraction"/>');
    expect(bajada).toContain('<size x="260" y="150" xunits="pixels" yunits="pixels"/>');
    expect(folder('Subida · 815 MHz')).toContain('<href>leyenda-subida.png</href>');
  });

  it('sin leyenda no hay ScreenOverlay', () => {
    expect(coverageKml('X', [{ name: 'Bajada', href: 'bajada.png', bounds }])).not.toContain('ScreenOverlay');
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
