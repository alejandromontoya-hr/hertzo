import { describe, expect, it } from 'vitest';
import type { ClearancePoint } from '../rf/pointToPoint';
import { linkProfileDrawing, linkProfileSvg } from './linkChart';

// Enlace de 10 km: línea a 130 m, Fresnel de 10 m en el medio. A los 5 km el terreno está a
// 127 m (despeje 3 m, 30 % de F1: invade el 60 %); en los demás puntos, a 100 m.
const point = (km: number, terrainM: number, fresnelM: number): ClearancePoint => ({
  distanceM: km * 1000,
  terrainM,
  lineM: 130,
  fresnelM,
  clearanceM: 130 - terrainM,
});
const pts = [point(0, 100, 0), point(2.5, 100, 8.7), point(5, 127, 10), point(7.5, 100, 8.7), point(10, 100, 0)];

describe('linkProfileDrawing', () => {
  it('marca con un círculo rojo solo el punto que invade el 60 % de la zona de Fresnel (5 km)', () => {
    const { markup } = linkProfileDrawing(pts, 800, 300);
    expect(markup.match(/<circle class="link-block"/g)).toHaveLength(1);
  });

  it('el eje horizontal va del margen izquierdo (56 px) al derecho (800 − 14 = 786 px)', () => {
    const { x, plotW } = linkProfileDrawing(pts, 800, 300);
    expect(x(0)).toBe(56);
    expect(x(10000)).toBe(786);
    expect(plotW).toBe(730);
  });
});

describe('linkProfileSvg', () => {
  const svg = linkProfileSvg(pts, 800, 300);

  it('es un SVG suelto del tamaño pedido, con sus estilos adentro', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300">')).toBe(true);
    expect(svg).toContain('<style>');
    expect(svg).toContain('.link-line { fill: none; stroke: #1f5c8c;');
  });

  it('con escala 2 la imagen mide el doble (1600 × 600) y el dibujo sigue en 800 × 300', () => {
    expect(linkProfileSvg(pts, 800, 300, 2)).toContain('width="1600" height="600" viewBox="0 0 800 300"');
  });

  it('trae las cinco capas de la gráfica', () => {
    for (const cls of ['link-fresnel', 'terrain', 'terrain-line', 'link-sixty', 'link-line']) {
      expect(svg).toContain(`<path class="${cls}"`);
    }
  });
});
