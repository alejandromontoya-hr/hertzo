// Del navegador: botón "Compartir" de una página. En el computador copia el enlace con un título
// (pegado en un correo se ve "Hertzo · Terreno 800 MHz · Cerro El Volador", no las letras de los
// datos); en el celular abre el menú de compartir del teléfono (WhatsApp, Teams, correo…).

import type { ParseResult } from './projectFile';
import { encodeShare, shareHash } from './shareLink';

export const SHARE_BUTTON_HTML = `
  <div class="button-row">
    <button type="button" class="button" data-share title="Copia un enlace con todo lo que tienes en la página">Compartir</button>
  </div>
  <p class="hint" data-share-message role="status" hidden></p>`;

export interface ShareBinding {
  /** Título del enlace, por ejemplo "Hertzo · Terreno 800 MHz · Cerro El Volador". */
  title(): string;
  /** Los datos de la página tal como están ahora (solo lo que cambió). */
  data(): Record<string, unknown>;
}

const OPENED =
  'Abriste una simulación compartida. Es una copia: lo que cambies queda solo en este navegador y no le llega a quien te la mandó.';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Celular o tableta: ahí el menú de compartir del sistema es lo natural; en el computador, copiar. */
const useSystemShare = () => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * Conecta `SHARE_BUTTON_HTML`, que debe estar dentro de `root`. `opened` es el enlace con que se
 * abrió la página: si trae datos, avisa que es una copia; si no sirvió, dice por qué.
 */
export function bindShareButton(root: HTMLElement, binding: ShareBinding, opened: ParseResult<unknown> | null): void {
  const button = root.querySelector<HTMLButtonElement>('[data-share]')!;
  const message = root.querySelector<HTMLElement>('[data-share-message]')!;
  const show = (text: string) => {
    message.hidden = false;
    message.textContent = text;
  };
  if (opened) show(opened.ok ? OPENED : opened.message);

  button.addEventListener('click', async () => {
    const title = binding.title();
    const urlPromise = encodeShare(binding.data()).then((code) => `${location.origin}${location.pathname}${location.search}${shareHash(code)}`);
    const showUrl = async () => show(`No se pudo copiar solo. Copia este enlace: ${await urlPromise}`);
    if (useSystemShare()) {
      try {
        await navigator.share({ title, url: await urlPromise });
      } catch (err) {
        // Cerrar el menú sin elegir no es un error; otro fallo deja el enlace a la vista.
        if ((err as Error).name !== 'AbortError') await showUrl();
      }
      return;
    }
    // El copiado empieza en el mismo clic (Safari no lo deja después) y espera a que el enlace esté listo.
    const blob = (type: string, text: (url: string) => string) => urlPromise.then((url) => new Blob([text(url)], { type }));
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob('text/html', (url) => `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`),
          'text/plain': blob('text/plain', (url) => url),
        }),
      ]);
      show('Enlace copiado: pégalo en un correo, WhatsApp o Teams. Quien lo abra recibe una copia; lo que cambie no te afecta.');
    } catch {
      // Sin permiso para copiar (o un navegador viejo): el enlace queda a la vista para copiarlo a mano.
      await showUrl();
    }
  });
}
