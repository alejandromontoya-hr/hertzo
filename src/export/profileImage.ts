// Del navegador: imagen PNG del perfil de un enlace para informes. Lleva el título, los dos
// extremos, el perfil como en Hertzo con su leyenda, el veredicto y la tabla de resultados.

import type { ClearancePoint } from '../rf/pointToPoint';
import { linkProfileSvg } from '../ui/linkChart';
import { canvasToPng } from './download';

export interface ProfileReport {
  /** Por ejemplo «Perfil del enlace · 11,42 km · 11 GHz». */
  title: string;
  /** Líneas bajo el título: los extremos y la fecha. */
  subtitle: string[];
  points: ClearancePoint[];
  verdict: { color: string; text: string };
  /** Filas de la tabla de resultados: etiqueta, valor y si va resaltada. */
  rows: [string, string, boolean][];
  note: string;
}

/** Dibujada al doble de tamaño para que se vea nítida al ampliarla o imprimirla. */
const SCALE = 2;
const WIDTH = 1000;
const PAD = 28;
const CONTENT = WIDTH - 2 * PAD;
const CHART_HEIGHT = 340;
const ROW = 22;
const COLUMN_GAP = 24;
const FONT = '"Geist Variable", system-ui, "Segoe UI", Roboto, sans-serif';
// Colores del estilo «Carta» (src/style.css) y de la gráfica del perfil.
const SURFACE = '#fbfaf6';
const INK = '#1f2328';
const MUTED = '#5d6168';
const BORDER = '#d8d2c2';
const ACCENT = '#1f5c8c';

const DISCLAIMER =
  'Hecho con Hertzo (hertzo.site). Herramienta de planificación: sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados.';

/** Elementos de la leyenda, como bajo la gráfica de Hertzo. */
const KEY: { label: string; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }[] = [
  { label: 'Terreno con curvatura', draw: (c, x, y) => fillRect(c, '#e9dfc8', x, y - 4, 14, 8) },
  { label: 'Línea entre antenas', draw: (c, x, y) => strokeLine(c, ACCENT, 2, [], x, y, 14) },
  {
    label: '1.ª zona de Fresnel',
    draw: (c, x, y) => {
      fillRect(c, 'rgb(31 92 140 / 0.08)', x, y - 4, 14, 8);
      c.save();
      c.setLineDash([3, 2]);
      c.strokeStyle = 'rgb(31 92 140 / 0.6)';
      c.strokeRect(x + 0.5, y - 3.5, 13, 7);
      c.restore();
    },
  },
  { label: '60 % de la zona', draw: (c, x, y) => strokeLine(c, ACCENT, 1, [4, 3], x, y, 14) },
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

function fillRect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function strokeLine(ctx: CanvasRenderingContext2D, color: string, width: number, dash: number[], x: number, y: number, length: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.stroke();
  ctx.restore();
}

/** Parte el texto en líneas que caben en `width` con la fuente actual del lienzo. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

/**
 * Recorre el informe de arriba abajo. Sin `chart` solo mide (para saber el alto del lienzo);
 * con `chart` también dibuja. Devuelve el alto total.
 */
function layout(ctx: CanvasRenderingContext2D, r: ProfileReport, chart: HTMLImageElement | null): number {
  const draw = chart !== null;
  ctx.textBaseline = 'alphabetic';
  let y = PAD;

  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = INK;
  y += 20;
  if (draw) ctx.fillText(r.title, PAD, y);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = MUTED;
  for (const line of r.subtitle) {
    y += 20;
    if (draw) ctx.fillText(line, PAD, y);
  }

  y += 14;
  if (chart) ctx.drawImage(chart, PAD, y, CONTENT, CHART_HEIGHT);
  y += CHART_HEIGHT + 20;

  ctx.font = `12px ${FONT}`;
  let x = PAD;
  for (const item of KEY) {
    if (draw) {
      item.draw(ctx, x, y - 4);
      ctx.fillStyle = MUTED;
      ctx.fillText(item.label, x + 20, y);
    }
    x += 20 + ctx.measureText(item.label).width + 18;
  }

  // Veredicto: franja del color del veredicto a la izquierda, como en el panel.
  y += 18;
  ctx.font = `600 14px ${FONT}`;
  const verdictLines = wrap(ctx, r.verdict.text, CONTENT - 20);
  const verdictHeight = 14 + verdictLines.length * 20;
  if (draw) {
    fillRect(ctx, r.verdict.color, PAD, y, 4, verdictHeight);
    ctx.fillStyle = INK;
    verdictLines.forEach((line, i) => ctx.fillText(line, PAD + 16, y + 21 + i * 20));
  }
  y += verdictHeight + 12;

  // Tabla en dos columnas para que la imagen no quede tan alta.
  const half = Math.ceil(r.rows.length / 2);
  const columnWidth = (CONTENT - COLUMN_GAP) / 2;
  if (draw) {
    r.rows.forEach(([label, value, strong], i) => {
      const column = i < half ? 0 : 1;
      const left = PAD + column * (columnWidth + COLUMN_GAP);
      const top = y + (i % half) * ROW;
      ctx.fillStyle = BORDER;
      ctx.fillRect(left, top + ROW - 1, columnWidth, 1);
      ctx.font = `${strong ? '600 ' : ''}13px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.fillText(label, left, top + 15);
      ctx.textAlign = 'right';
      ctx.fillText(value, left + columnWidth, top + 15);
      ctx.textAlign = 'left';
    });
  }
  y += half * ROW + 14;

  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = MUTED;
  for (const line of wrap(ctx, r.note, CONTENT)) {
    y += 17;
    if (draw) ctx.fillText(line, PAD, y);
  }

  y += 10;
  ctx.font = `11px ${FONT}`;
  for (const line of wrap(ctx, DISCLAIMER, CONTENT)) {
    y += 16;
    if (draw) ctx.fillText(line, PAD, y);
  }
  return y + PAD;
}

export async function drawProfileReport(report: ProfileReport): Promise<Uint8Array<ArrayBuffer>> {
  await document.fonts.load(`600 13px ${FONT}`).catch(() => undefined);
  const chart = await loadSvg(linkProfileSvg(report.points, CONTENT, CHART_HEIGHT, SCALE));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const height = Math.ceil(layout(ctx, report, null));
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  fillRect(ctx, SURFACE, 0, 0, WIDTH, height);
  layout(ctx, report, chart);
  return canvasToPng(canvas);
}
