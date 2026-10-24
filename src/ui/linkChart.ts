// Gráfica de un enlace punto a punto: terreno con la curvatura de la Tierra, línea entre
// antenas, primera zona de Fresnel, línea del 60 % y puntos que la invaden.

import type { ClearancePoint } from '../rf/pointToPoint';
import { niceTicks } from './chartScale';
import { formatMeters } from './format';

const MARGIN = { top: 10, right: 14, bottom: 22, left: 56 };
const kmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export interface LinkChart {
  show(points: ClearancePoint[], title: string): void;
  showMessage(message: string): void;
}

export function createLinkChart(container: HTMLElement, onHover: (distanceM: number | null) => void): LinkChart {
  container.innerHTML = `
    <div class="profile-header">
      <span class="profile-title">Perfil del enlace</span>
      <span class="profile-readout"></span>
    </div>
    <div class="profile-body"></div>
    <div class="link-key">
      <span><i class="key-terrain"></i>Terreno con curvatura</span>
      <span><i class="key-line"></i>Línea entre antenas</span>
      <span><i class="key-fresnel"></i>1.ª zona de Fresnel</span>
      <span><i class="key-sixty"></i>60 % de la zona</span>
      <span><i class="key-block"></i>Invade el 60 %</span>
    </div>`;
  const title = container.querySelector<HTMLElement>('.profile-title')!;
  const readout = container.querySelector<HTMLElement>('.profile-readout')!;
  const body = container.querySelector<HTMLElement>('.profile-body')!;
  let current: ClearancePoint[] | null = null;
  let currentTitle = '';

  const render = () => {
    const pts = current;
    if (!pts || pts.length < 2) return;
    const width = body.clientWidth;
    const height = body.clientHeight;
    if (width === 0 || height === 0) return;
    title.textContent = currentTitle;
    const total = pts[pts.length - 1]!.distanceM;
    let min = Infinity;
    let max = -Infinity;
    for (const p of pts) {
      min = Math.min(min, p.terrainM);
      max = Math.max(max, p.terrainM, p.lineM + p.fresnelM);
    }
    const pad = Math.max(10, (max - min) * 0.06);
    const yMin = min - pad;
    const yMax = max + pad;
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const x = (d: number) => MARGIN.left + (d / total) * plotW;
    const y = (h: number) => MARGIN.top + (1 - (h - yMin) / (yMax - yMin)) * plotH;
    const path = (f: (p: ClearancePoint) => number) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distanceM).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');

    const bottom = (MARGIN.top + plotH).toFixed(1);
    const terrain = path((p) => p.terrainM);
    const area = `${terrain}L${x(total).toFixed(1)},${bottom}L${MARGIN.left},${bottom}Z`;
    const upper = path((p) => p.lineM + p.fresnelM);
    const lowerPts = [...pts].reverse().map((p) => `L${x(p.distanceM).toFixed(1)},${y(p.lineM - p.fresnelM).toFixed(1)}`).join('');
    const fresnelArea = `${upper}${lowerPts}Z`;
    const blocked = pts
      .filter((p, i) => i > 0 && i < pts.length - 1 && p.clearanceM < 0.6 * p.fresnelM)
      .map((p) => `<circle class="link-block" cx="${x(p.distanceM).toFixed(1)}" cy="${y(p.terrainM).toFixed(1)}" r="2.2"/>`)
      .join('');

    const yTicks = niceTicks(yMin, yMax, Math.max(2, Math.floor(plotH / 32)));
    const xTicks = niceTicks(0, total / 1000, Math.max(2, Math.floor(plotW / 70)));
    body.innerHTML = `
      <svg width="${width}" height="${height}" role="img" aria-label="Perfil del enlace de ${kmFormat.format(total / 1000)} km">
        ${yTicks.map((t) => `<line class="grid" x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${MARGIN.left - 6}" y="${y(t) + 4}" text-anchor="end">${formatMeters(t)}</text>`).join('')}
        ${xTicks.map((t) => `<text class="axis" x="${x(t * 1000)}" y="${height - 6}" text-anchor="middle">${kmFormat.format(t)} km</text>`).join('')}
        <path class="link-fresnel" d="${fresnelArea}"/>
        <path class="terrain" d="${area}"/>
        <path class="terrain-line" d="${terrain}"/>
        <path class="link-sixty" d="${path((p) => p.lineM - 0.6 * p.fresnelM)}"/>
        <path class="link-line" d="${path((p) => p.lineM)}"/>
        ${blocked}
        <line class="cursor" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" visibility="hidden"/>
        <rect class="hit" x="${MARGIN.left}" y="${MARGIN.top}" width="${plotW}" height="${plotH}"/>
      </svg>`;

    const svg = body.querySelector('svg')!;
    const cursor = svg.querySelector<SVGLineElement>('.cursor')!;
    const hit = svg.querySelector<SVGRectElement>('.hit')!;
    hit.addEventListener('pointermove', (event) => {
      const rect = svg.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left - MARGIN.left) / plotW));
      const p = pts[Math.round(fraction * (pts.length - 1))]!;
      cursor.setAttribute('visibility', 'visible');
      cursor.setAttribute('x1', String(x(p.distanceM)));
      cursor.setAttribute('x2', String(x(p.distanceM)));
      const ratio = p.fresnelM > 0 ? `${percentFormat.format((100 * p.clearanceM) / p.fresnelM)} % de F1` : '—';
      readout.textContent = `A ${kmFormat.format(p.distanceM / 1000)} km: terreno ${formatMeters(p.terrainM)} · línea ${formatMeters(p.lineM)} · F1 ${formatMeters(p.fresnelM)} · despeje ${formatMeters(p.clearanceM)} (${ratio})`;
      onHover(p.distanceM);
    });
    hit.addEventListener('pointerleave', () => {
      cursor.setAttribute('visibility', 'hidden');
      readout.textContent = '';
      onHover(null);
    });
  };

  new ResizeObserver(render).observe(body);

  return {
    show(points, chartTitle) {
      container.hidden = false;
      readout.textContent = '';
      current = points;
      currentTitle = chartTitle;
      render();
    },
    showMessage(message) {
      container.hidden = false;
      current = null;
      body.innerHTML = '';
      title.textContent = 'Perfil del enlace';
      readout.textContent = message;
    },
  };
}
