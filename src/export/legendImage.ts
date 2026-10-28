// Del navegador: la leyenda de una capa dibujada como imagen PNG, para la esquina de Google Earth.
// Mismo contenido y estilo que la leyenda sobre el mapa de Hertzo.

import type { LegendEntry } from '../ui/coverageLegend';
import { canvasToPng } from './download';

export interface LegendImageContent {
  /** Primera línea, en negrita: por ejemplo "Bajada · 860 MHz". */
  heading: string;
  /** Qué muestran los colores: por ejemplo "Nivel recibido en el radio (dBm)". */
  title: string;
  entries: LegendEntry[];
  /** Qué significa un píxel sin color. */
  emptyLabel: string;
  /** Texto del rayado de baja confianza. */
  hatchLabel: string;
}

export interface LegendImage {
  png: Uint8Array;
  /** Tamaño en pantalla (píxeles); la imagen va al doble para verse nítida. */
  width: number;
  height: number;
}

/** Dibujada al doble de tamaño: Google Earth la reduce y se ve nítida en pantallas de alta densidad. */
const SCALE = 2;
const PADDING = 12;
const LINE = 18;
const SWATCH_W = 22;
const SWATCH_H = 12;
const SWATCH_GAP = 8;
const FONT = '"Geist Variable", system-ui, "Segoe UI", Roboto, sans-serif';
// Colores del estilo "Carta" (src/style.css).
const SURFACE = '#fbfaf6';
const INK = '#1f2328';
const MUTED = '#5d6168';
const BORDER = '#d8d2c2';
const HATCH = '#373737';

export async function drawLegendImage(content: LegendImageContent): Promise<LegendImage> {
  await document.fonts.load(`600 13px ${FONT}`).catch(() => undefined);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const rows: { swatch?: string; hatch?: boolean; text: string }[] = [
    ...content.entries.map((e) => ({ swatch: e.color, text: e.label })),
    { text: `Sin color: ${content.emptyLabel}` },
    { hatch: true, text: `Rayado: ${content.hatchLabel}` },
  ];
  const headingFont = `600 13px ${FONT}`;
  const textFont = `12px ${FONT}`;

  // Ancho según el texto más largo.
  ctx.font = headingFont;
  let textWidth = ctx.measureText(content.heading).width;
  ctx.font = textFont;
  textWidth = Math.max(textWidth, ctx.measureText(content.title).width);
  for (const row of rows) {
    const indent = row.swatch || row.hatch ? SWATCH_W + SWATCH_GAP : 0;
    textWidth = Math.max(textWidth, indent + ctx.measureText(row.text).width);
  }
  const width = Math.ceil(textWidth + 2 * PADDING);
  const height = PADDING * 2 + LINE * (2 + rows.length) + 4;

  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = SURFACE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, width - 1, height - 1, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = 'middle';
  let y = PADDING + LINE / 2;
  ctx.fillStyle = INK;
  ctx.font = headingFont;
  ctx.fillText(content.heading, PADDING, y);
  y += LINE;
  ctx.fillStyle = MUTED;
  ctx.font = textFont;
  ctx.fillText(content.title, PADDING, y);
  y += LINE + 4;

  for (const row of rows) {
    let x = PADDING;
    if (row.swatch) {
      ctx.fillStyle = row.swatch;
      ctx.fillRect(x, y - SWATCH_H / 2, SWATCH_W, SWATCH_H);
    }
    if (row.hatch) drawHatchSwatch(ctx, x, y - SWATCH_H / 2);
    if (row.swatch || row.hatch) x += SWATCH_W + SWATCH_GAP;
    ctx.fillStyle = INK;
    ctx.fillText(row.text, x, y);
    y += LINE;
  }

  return { png: await canvasToPng(canvas), width, height };
}

/** Muestra del rayado: diagonales de 2 px cada 6 px que bajan hacia la izquierda, como sobre el mapa. */
function drawHatchSwatch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, SWATCH_W, SWATCH_H);
  ctx.clip();
  ctx.strokeStyle = HATCH;
  ctx.lineWidth = 2;
  for (let d = 0; d < SWATCH_W + SWATCH_H; d += 6) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d - SWATCH_H, y + SWATCH_H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, SWATCH_W - 1, SWATCH_H - 1);
}
