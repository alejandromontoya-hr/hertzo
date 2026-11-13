// Del navegador: compartir una página. "Copiar enlace" pone el enlace con un título (pegado en un
// correo se ve "Hertzo · Terreno 800 MHz · Cerro El Volador", no las letras de los datos); el
// aviso de arriba del panel le dice a quien abrió un enlace que tiene una copia.

import type { ParseResult } from './projectFile';
import { encodeShare, shareHash } from './shareLink';

export const SHARE_BUTTON_HTML = `
  <div class="button-row">
    <button type="button" class="button" data-share title="Copia un enlace con todo lo que tienes en la página">Compartir</button>
  </div>
  <p class="hint" data-share-message role="status" hidden></p>`;

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
 * Muestra en `[data-share-message]` (dentro de `root`) cómo se abrió la página: si el enlace trajo
 * datos, avisa que es una copia (con `openedNote` al final, por ejemplo dónde quedó lo que había);
 * si no sirvió, dice por qué. Sin enlace no muestra nada.
 */
export function showSharedNotice(root: HTMLElement, opened: ParseResult<unknown> | null, openedNote?: string): (text: string) => void {
  const message = root.querySelector<HTMLElement>('[data-share-message]')!;
  const show = (text: string) => {
    message.hidden = false;
    message.textContent = text;
  };
  if (opened) show(opened.ok ? [OPENED, openedNote].filter(Boolean).join(' ') : opened.message);
  return show;
}

/** Conecta `SHARE_BUTTON_HTML`, que debe estar dentro de `root`, y muestra el aviso del enlace con que se abrió. */
export function bindShareButton(root: HTMLElement, binding: ShareBinding, opened: ParseResult<unknown> | null, openedNote?: string): void {
  const button = root.querySelector<HTMLButtonElement>('[data-share]')!;
  const show = showSharedNotice(root, opened, openedNote);

  button.addEventListener('click', async () => {
    const title = binding.title();
    const url = shareUrl(binding);
    const showUrl = async () => show(`No se pudo copiar solo. Copia este enlace: ${await url}`);
    if (canUseSystemShare()) {
      try {
        await navigator.share({ title, url: await url });
      } catch (err) {
        // Cerrar el menú sin elegir no es un error; otro fallo deja el enlace a la vista.
        if ((err as Error).name !== 'AbortError') await showUrl();
      }
      return;
    }
    if (await copyShareLink(title, url)) show(COPIED_MESSAGE);
    else await showUrl();
  });
}
