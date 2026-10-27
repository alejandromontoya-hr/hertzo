// Del navegador: imagen PNG del perfil de un enlace para informes. Lleva el título, los dos
// extremos, el perfil como en Hertzo con su leyenda, el veredicto y la tabla de resultados.

import type { ClearancePoint } from '../rf/pointToPoint';
import { linkProfileSvg } from '../ui/linkChart';
import { REPORT_CONTENT_WIDTH, REPORT_SCALE, drawReport, type ReportKeyItem, type ReportRow } from './reportImage';

export interface ProfileReport {
  /** Por ejemplo «Perfil del enlace · 11,42 km · 11 GHz». */
  title: string;
  /** Líneas bajo el título: los extremos y la fecha. */
  subtitle: string[];
  points: ClearancePoint[];
  /** Filas de la tabla de resultados; la primera es el veredicto. */
  rows: ReportRow[];
  /** Explicación del veredicto. */
  notice: string;
  note: string;
}

const CHART_HEIGHT = 340;
// Colores de la gráfica del perfil (src/style.css).
const ACCENT = '#1f5c8c';

function strokeLine(ctx: CanvasRenderingContext2D, color: string, width: number, dash: number[], x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 14, y);
  ctx.stroke();
  ctx.restore();
}

/** Elementos de la leyenda, como bajo la gráfica de Hertzo. */
const KEY: ReportKeyItem[] = [
  {
    label: 'Terreno con curvatura',
    draw: (c, x, y) => {
      c.fillStyle = '#e9dfc8';
      c.fillRect(x, y - 4, 14, 8);
    },
  },
  { label: 'Línea entre antenas', draw: (c, x, y) => strokeLine(c, ACCENT, 2, [], x, y) },
  {
    label: '1.ª zona de Fresnel',
    draw: (c, x, y) => {
      c.fillStyle = 'rgb(31 92 140 / 0.08)';
      c.fillRect(x, y - 4, 14, 8);
      c.save();
      c.setLineDash([3, 2]);
      c.strokeStyle = 'rgb(31 92 140 / 0.6)';
      c.strokeRect(x + 0.5, y - 3.5, 13, 7);
      c.restore();
    },
  },
  { label: '60 % de la zona', draw: (c, x, y) => strokeLine(c, ACCENT, 1, [4, 3], x, y) },
  {
    label: 'Invade el 60 %',
    draw: (c, x, y) => {
      c.fillStyle = '#cf222e';
      c.beginPath();
      c.arc(x + 4, y, 4, 0, 2 * Math.PI);
      c.fill();
    },
  },
];

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

export async function drawProfileReport(report: ProfileReport): Promise<Uint8Array<ArrayBuffer>> {
  const chart = await loadSvg(linkProfileSvg(report.points, REPORT_CONTENT_WIDTH, CHART_HEIGHT, REPORT_SCALE));
  return drawReport({
    title: report.title,
    subtitle: report.subtitle,
    figure: chart,
    figureHeight: CHART_HEIGHT,
    key: KEY,
    rows: report.rows,
    notice: report.notice,
    note: report.note,
  });
}
