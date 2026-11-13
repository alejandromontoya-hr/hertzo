// Enlace para compartir una simulación: los datos van comprimidos dentro de la dirección, después
// del "#" (hertzo.site/terreno?banda=800#d=…). Esa parte nunca sale del navegador: no viaja a
// ningún servidor, así que Hertzo no guarda los datos ni puede verlos. Quien abre el enlace
// recibe una copia; lo que cambie queda solo en su navegador. Módulo puro.

import type { LonLat } from '../geo/geodesy';
import type { NumberFieldSpec } from '../ui/fields';
import { isFiniteNumber, isRecord, type ParseResult } from './projectFile';

/**
 * Versión del formato; sube cuando un cambio impide que una versión vieja de Hertzo lo lea. Al
 * subirla, cada lector debe seguir entendiendo la anterior: con ella se abren los enlaces viejos y
 * lo que cada navegador tiene guardado (src/pages/shared/draft.ts).
 */
export const SHARE_VERSION = 1;

/** "#d=" + los datos. */
const HASH_PREFIX = '#d=';

/** Los datos ya comprimidos, listos para ir después de "#d=". */
export async function encodeShare(data: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify({ v: SHARE_VERSION, ...data });
  const bytes = await transform(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return toBase64Url(bytes);
}

export const shareHash = (code: string) => `${HASH_PREFIX}${code}`;

/** WhatsApp (app o web) con el título y, en la línea siguiente, el enlace; falta elegir a quién. */
export const whatsappHref = (title: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;

/** Correo nuevo con el título de asunto y el enlace en el cuerpo (solo texto: se ve la dirección larga). */
export const mailHref = (title: string, url: string) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;

/**
 * Los datos de "#d=…", o null si la dirección no trae un enlace compartido. Ignora la puntuación
 * pegada al final de un enlace copiado de un texto: "#d=abc." → "abc".
 */
export function shareCodeFromHash(hash: string): string | null {
  const match = /^#d=([A-Za-z0-9_-]+)[.,)]*$/.exec(hash);
  return match ? match[1]! : null;
}

/** Mensaje cuando la página no pudo usar los datos del enlace. */
export const SHARE_BROKEN_MESSAGE = 'El enlace está incompleto o dañado (quizá se cortó al copiarlo): la página abrió con sus valores de siempre.';

/** Lee el enlace: los datos tal como los guardó la página, sin revisar todavía su contenido. */
export async function decodeShare(code: string): Promise<ParseResult<Record<string, unknown>>> {
  let data: unknown;
  try {
    const bytes = await transform(fromBase64Url(code), new DecompressionStream('deflate-raw'));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, message: SHARE_BROKEN_MESSAGE };
  }
  if (!isRecord(data) || !isFiniteNumber(data.v)) return { ok: false, message: SHARE_BROKEN_MESSAGE };
  if (data.v > SHARE_VERSION) {
    return { ok: false, message: 'El enlace es de una versión más nueva de Hertzo: recarga la página para abrirlo.' };
  }
  return { ok: true, data };
}

// --- Para armar y revisar los datos de cada página ---

/** Solo los campos que cambiaron frente a los valores por omisión, para que el enlace sea corto. */
export function changedFields<T extends object>(values: T, base: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T)[]) {
    if (values[key] !== base[key]) out[key] = values[key];
  }
  return out;
}

/** El valor cabe en el rango del campo del formulario (el mismo que acepta al escribirlo). */
export function inFieldRange(value: unknown, spec: NumberFieldSpec): value is number {
  if (!isFiniteNumber(value)) return false;
  return (spec.minExclusive ? value > spec.min : value >= spec.min) && value <= spec.max;
}

/**
 * Los valores por omisión con los campos que trae el enlace encima. Null si alguno no es un
 * número o se sale del rango de su campo; sin datos (undefined), los valores por omisión.
 */
export function readFields<T extends object>(data: unknown, specs: readonly NumberFieldSpec<Extract<keyof T, string>>[], base: T): T | null {
  if (data === undefined) return { ...base };
  if (!isRecord(data)) return null;
  const out = { ...base };
  for (const spec of specs) {
    if (!(spec.key in data)) continue;
    const value = data[spec.key];
    if (!inFieldRange(value, spec)) return null;
    (out as Record<string, number>)[spec.key] = value;
  }
  return out;
}

/** Coordenadas con 6 decimales (≈ 11 cm), más finas que un GPS: no se pierde nada útil. */
const roundDegrees = (v: number) => Math.round(v * 1e6) / 1e6;

/** [latitud, longitud], como se escriben en el panel. */
export const positionData = (p: LonLat): [number, number] => [roundDegrees(p.lat), roundDegrees(p.lon)];

/** Lee [latitud, longitud]; null si no son coordenadas válidas. */
export function readPosition(v: unknown): LonLat | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lat, lon] = v as unknown[];
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Texto de hasta `max` caracteres; null si no es texto o es más largo. */
export function readText(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

// --- Compresión y Base64 para direcciones ("-" y "_" en vez de "+" y "/", sin "=") ---

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
