// Del navegador: lo que usa el botón "Compartir" del mapa (src/map/shareControl.ts) para armar y
// copiar el enlace (pegado en un correo se ve "Hertzo · Terreno 800 MHz · Cerro El Volador", no las
// letras de los datos), y el aviso de arriba del panel para quien abrió un enlace: tiene una copia.

import type { ParseResult } from './projectFile';
import { encodeShare, shareHash } from './shareLink';

/** Lugar del aviso "Abriste una simulación compartida…", arriba del panel. */
export const SHARE_NOTICE_HTML = `<p class="hint" data-share-message role="status" hidden></p>`;

export interface ShareBinding {
  /** Título del enlace, por ejemplo "Hertzo · Terreno 800 MHz · Cerro El Volador". */
  title(): string;
  /** Los datos de la página tal como están ahora (solo lo que cambió). */
  data(): Record<string, unknown>;
}

const OPENED =
  'Abriste una simulación compartida. Es una copia: lo que cambies queda solo en este navegador y no le llega a quien te la mandó.';

export const COPIED_MESSAGE = 'Enlace copiado: pégalo en un correo, WhatsApp o Teams. Quien lo abra recibe una copia; lo que cambie no te afecta.';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Celular o tableta: ahí el menú de compartir del sistema es lo natural. */
export const canUseSystemShare = () => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** La dirección de esta página con los datos de ahora después del "#". */
export const shareUrl = (binding: ShareBinding) =>
  encodeShare(binding.data()).then((code) => `${location.origin}${location.pathname}${location.search}${shareHash(code)}`);

/**
 * Copia el enlace con su título; false si el navegador no dejó (sin permiso o muy viejo). Hay que
 * llamarla en el mismo clic: Safari no deja copiar después, por eso espera el enlace adentro.
 */
export async function copyShareLink(title: string, url: Promise<string>): Promise<boolean> {
  const blob = (type: string, text: (url: string) => string) => url.then((u) => new Blob([text(u)], { type }));
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob('text/html', (u) => `<a href="${escapeHtml(u)}">${escapeHtml(title)}</a>`),
        'text/plain': blob('text/plain', (u) => u),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Muestra en `SHARE_NOTICE_HTML` (dentro de `root`) cómo se abrió la página: si el enlace trajo
 * datos, avisa que es una copia (con `openedNote` al final, por ejemplo dónde quedó lo que había);
 * si no sirvió, dice por qué. Sin enlace no muestra nada.
 */
export function showSharedNotice(root: HTMLElement, opened: ParseResult<unknown> | null, openedNote?: string): void {
  if (!opened) return;
  const message = root.querySelector<HTMLElement>('[data-share-message]')!;
  message.hidden = false;
  message.textContent = opened.ok ? [OPENED, openedNote].filter(Boolean).join(' ') : opened.message;
}
