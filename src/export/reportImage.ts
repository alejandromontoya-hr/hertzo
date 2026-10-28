// Del navegador: imagen PNG para informes, igual para todos los simuladores. Lleva el título,
// unas líneas de contexto, una figura (perfil o plano) con su leyenda, la tabla de resultados en
// dos columnas, un aviso opcional, una nota y el aviso de herramienta de planificación.

import { canvasToPng } from './download';

/** Elemento de la leyenda: su muestra se dibuja en (x, y), centrada en la línea del texto. */
export interface ReportKeyItem {
  label: string;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
}

/** Fila de la tabla: etiqueta, valor, si va resaltada y, opcional, el color de un punto junto al valor. */
export type ReportRow = [label: string, value: string, strong: boolean, dot?: string];

export interface Report {
  title: string;
  /** Líneas bajo el título: lugar, ajustes, fecha. */
  subtitle: string[];
  /** Figura ya dibujada; se estira al ancho del contenido con este alto (px). */
  figure: CanvasImageSource;
  figureHeight: number;
  key: ReportKeyItem[];
  rows: ReportRow[];
  /** Frase que explica el resultado, en texto normal bajo la tabla (por ejemplo, el veredicto). */
  notice?: string;
  note: string;
}

/** Dibujada al doble de tamaño para que se vea nítida al ampliarla o imprimirla. */
export const REPORT_SCALE = 2;
const WIDTH = 1000;
const PAD = 28;
/** Ancho útil (px) para la figura. */
export const REPORT_CONTENT_WIDTH = WIDTH - 2 * PAD;
const ROW = 22;
const COLUMN_GAP = 24;
const KEY_LINE = 20;
export const REPORT_FONT = '"Geist Variable", system-ui, "Segoe UI", Roboto, sans-serif';
// Colores del estilo "Carta" (src/style.css).
const SURFACE = '#fbfaf6';
const INK = '#1f2328';
const MUTED = '#5d6168';
const BORDER = '#d8d2c2';

const DISCLAIMER =
  'Hecho con Hertzo (hertzo.site). Herramienta de planificación: sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados.';

/** Muestra de color de la leyenda (14 × 8 px), con borde si es blanca o casi. */
export function swatchKey(label: string, color: string, outline = false): ReportKeyItem {
  return {
    label,
    draw(ctx, x, y) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 4, 14, 8);
      if (outline) {
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y - 3.5, 13, 7);
      }
    },
  };
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

/**
 * Recorre el informe de arriba abajo. Con `draw` en falso solo mide, para saber el alto del
 * lienzo; en verdadero también dibuja. Devuelve el alto total.
 */
function layout(ctx: CanvasRenderingContext2D, r: Report, draw: boolean): number {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let y = PAD;

  ctx.font = `600 20px ${REPORT_FONT}`;
  ctx.fillStyle = INK;
  y += 20;
  if (draw) ctx.fillText(r.title, PAD, y);
  ctx.font = `13px ${REPORT_FONT}`;
  ctx.fillStyle = MUTED;
  for (const line of r.subtitle) {
    y += 20;
    if (draw) ctx.fillText(line, PAD, y);
  }

  y += 14;
  if (draw) ctx.drawImage(r.figure, PAD, y, REPORT_CONTENT_WIDTH, r.figureHeight);
  y += r.figureHeight + 20;

  // Leyenda: los elementos siguen en la línea de abajo cuando no caben.
  ctx.font = `12px ${REPORT_FONT}`;
  let x = PAD;
  for (const item of r.key) {
    const width = 20 + ctx.measureText(item.label).width;
    if (x > PAD && x + width > PAD + REPORT_CONTENT_WIDTH) {
      x = PAD;
      y += KEY_LINE;
    }
    if (draw) {
      item.draw(ctx, x, y - 4);
      ctx.fillStyle = MUTED;
      ctx.fillText(item.label, x + 20, y);
    }
    x += width + 18;
  }

  y += 12;

  // Tabla en dos columnas para que la imagen no quede tan alta.
  const half = Math.ceil(r.rows.length / 2);
  const columnWidth = (REPORT_CONTENT_WIDTH - COLUMN_GAP) / 2;
  if (draw) {
    r.rows.forEach(([label, value, strong, dot], i) => {
      const left = PAD + (i < half ? 0 : columnWidth + COLUMN_GAP);
      const top = y + (i % half) * ROW;
      ctx.fillStyle = BORDER;
      ctx.fillRect(left, top + ROW - 1, columnWidth, 1);
      ctx.font = `${strong ? '600 ' : ''}13px ${REPORT_FONT}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.fillText(label, left, top + 15);
      ctx.textAlign = 'right';
      ctx.fillText(value, left + columnWidth, top + 15);
      ctx.textAlign = 'left';
      if (dot) {
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(left + columnWidth - ctx.measureText(value).width - 9, top + 11, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }
  y += half * ROW + 14;

  if (r.notice) {
    ctx.font = `13px ${REPORT_FONT}`;
    ctx.fillStyle = INK;
    for (const line of wrap(ctx, r.notice, REPORT_CONTENT_WIDTH)) {
      y += 19;
      if (draw) ctx.fillText(line, PAD, y);
    }
    y += 4;
  }

  ctx.font = `12px ${REPORT_FONT}`;
  ctx.fillStyle = MUTED;
  for (const line of wrap(ctx, r.note, REPORT_CONTENT_WIDTH)) {
    y += 17;
    if (draw) ctx.fillText(line, PAD, y);
  }

  y += 10;
  ctx.font = `11px ${REPORT_FONT}`;
  for (const line of wrap(ctx, DISCLAIMER, REPORT_CONTENT_WIDTH)) {
    y += 16;
    if (draw) ctx.fillText(line, PAD, y);
  }
  return y + PAD;
}

export async function drawReport(report: Report): Promise<Uint8Array<ArrayBuffer>> {
  await document.fonts.load(`600 13px ${REPORT_FONT}`).catch(() => undefined);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const height = Math.ceil(layout(ctx, report, false));
  canvas.width = WIDTH * REPORT_SCALE;
  canvas.height = height * REPORT_SCALE;
  ctx.scale(REPORT_SCALE, REPORT_SCALE);
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, height);
  layout(ctx, report, true);
  return canvasToPng(canvas);
}

/** "26 de octubre de 2026". */
export const reportDate = () => new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date());
