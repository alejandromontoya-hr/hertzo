import { pointAtDistance, type TerrainProfile } from '../terrain/profile';
import { niceTicks } from './chartScale';
import { formatLonLat, formatMeters } from './format';
import type { LonLat } from '../geo/geodesy';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 8, right: 12, bottom: 22, left: 52 };

const kmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const formatKm = (m: number) => `${kmFormat.format(m / 1000)} km`;

export interface ProfileChart {
  showLoading(): void;
  show(profile: TerrainProfile): void;
  showError(message: string): void;
  hide(): void;
}

/**
 * Gráfica del perfil de terreno. Al pasar el cursor muestra distancia, cota y coordenadas
 * del punto, y avisa con `onHover` para señalarlo en el mapa.
 */
export function createProfileChart(
  container: HTMLElement,
  onHover: (point: LonLat | null) => void,
  onClose: () => void,
): ProfileChart {
  container.innerHTML = `
    <div class="profile-header">
      <span class="profile-title">Perfil del terreno</span>
      <span class="profile-readout"></span>
      <button type="button" class="profile-close" aria-label="Cerrar el perfil">×</button>
    </div>
    <div class="profile-body"></div>`;
  const title = container.querySelector<HTMLElement>('.profile-title')!;
  const readout = container.querySelector<HTMLElement>('.profile-readout')!;
  const body = container.querySelector<HTMLElement>('.profile-body')!;
  container.querySelector('.profile-close')!.addEventListener('click', onClose);

  let current: TerrainProfile | null = null;

  const summary = (p: TerrainProfile) => {
    let min = Infinity;
    let max = -Infinity;
    for (const h of p.elevationsM) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    return { min, max };
  };

  const render = () => {
    const p = current;
    if (!p) return;
    const width = body.clientWidth;
    const height = body.clientHeight;
    if (width === 0 || height === 0) return;
    const { min, max } = summary(p);
    title.textContent = `Perfil del terreno · ${formatKm(p.distanceM)}`;
    readout.textContent = `Mín. ${formatMeters(min)} · Máx. ${formatMeters(max)}`;

    const pad = Math.max(20, (max - min) * 0.08);
    const yMin = min - pad;
    const yMax = max + pad;
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const x = (d: number) => MARGIN.left + (p.distanceM > 0 ? (d / p.distanceM) * plotW : 0);
    const y = (h: number) => MARGIN.top + (1 - (h - yMin) / (yMax - yMin)) * plotH;

    let line = '';
    for (let i = 0; i < p.distancesM.length; i++) {
      line += `${i === 0 ? 'M' : 'L'}${x(p.distancesM[i]!).toFixed(1)},${y(p.elevationsM[i]!).toFixed(1)}`;
    }
    const bottom = (MARGIN.top + plotH).toFixed(1);
    const area = `${line}L${x(p.distanceM).toFixed(1)},${bottom}L${MARGIN.left},${bottom}Z`;

    const yTicks = niceTicks(yMin, yMax, Math.max(2, Math.floor(plotH / 32)));
    const xTicks = niceTicks(0, p.distanceM / 1000, Math.max(2, Math.floor(plotW / 70)));

    body.innerHTML = `
      <svg xmlns="${SVG_NS}" width="${width}" height="${height}" role="img"
           aria-label="Perfil del terreno de ${formatKm(p.distanceM)}">
        ${yTicks
          .map(
            (t) => `<line class="grid" x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(t)}" y2="${y(t)}"/>
                    <text class="axis" x="${MARGIN.left - 6}" y="${y(t) + 4}" text-anchor="end">${formatMeters(t)}</text>`,
          )
          .join('')}
        ${xTicks
          .map(
            (t) => `<text class="axis" x="${x(t * 1000)}" y="${height - 6}" text-anchor="middle">${kmFormat.format(t)} km</text>`,
          )
          .join('')}
        <path class="terrain" d="${area}"/>
        <path class="terrain-line" d="${line}"/>
        <line class="cursor" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" visibility="hidden"/>
        <circle class="cursor-dot" r="4" visibility="hidden"/>
        <rect class="hit" x="${MARGIN.left}" y="${MARGIN.top}" width="${plotW}" height="${plotH}"/>
      </svg>`;

    const svg = body.querySelector('svg')!;
    const cursor = svg.querySelector<SVGLineElement>('.cursor')!;
    const dot = svg.querySelector<SVGCircleElement>('.cursor-dot')!;
    const hit = svg.querySelector<SVGRectElement>('.hit')!;

    hit.addEventListener('pointermove', (event) => {
      const rect = svg.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left - MARGIN.left) / plotW));
      const i = Math.round(fraction * (p.distancesM.length - 1));
      const d = p.distancesM[i]!;
      const h = p.elevationsM[i]!;
      for (const el of [cursor, dot]) el.setAttribute('visibility', 'visible');
      cursor.setAttribute('x1', String(x(d)));
      cursor.setAttribute('x2', String(x(d)));
      dot.setAttribute('cx', String(x(d)));
      dot.setAttribute('cy', String(y(h)));
      const point = pointAtDistance(p, d);
      readout.textContent = `A ${formatKm(d)}: ${formatMeters(h)} · ${formatLonLat(point.lon, point.lat)}`;
      onHover(point);
    });
    hit.addEventListener('pointerleave', () => {
      for (const el of [cursor, dot]) el.setAttribute('visibility', 'hidden');
      readout.textContent = `Mín. ${formatMeters(min)} · Máx. ${formatMeters(max)}`;
      onHover(null);
    });
  };

  new ResizeObserver(render).observe(body);

  return {
    showLoading() {
      container.hidden = false;
      title.textContent = 'Perfil del terreno';
      readout.textContent = 'Descargando terreno…';
    },
    show(profile) {
      container.hidden = false;
      current = profile;
      render();
    },
    showError(message) {
      container.hidden = false;
      current = null;
      body.innerHTML = '';
      readout.textContent = message;
    },
    hide() {
      container.hidden = true;
      current = null;
      body.innerHTML = '';
      onHover(null);
    },
  };
}
