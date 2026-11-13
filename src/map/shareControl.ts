import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { COPIED_MESSAGE, canUseSystemShare, copyShareLink, shareUrl, type ShareBinding } from '../export/shareButton';
import { mailHref, whatsappHref } from '../export/shareLink';
import { SHARE_ICON } from '../ui/icons';

/** Cuánto se queda a la vista "Enlace copiado…". */
const COPIED_VISIBLE_MS = 5000;

interface ShareMenu {
  element: HTMLElement;
  destroy(): void;
}

/**
 * Botón redondo "Compartir" con el estilo del de exportar, siempre encendido: se puede compartir
 * un sitio aunque todavía no se haya calculado. Al abrirlo arma el enlace con lo que hay en la
 * página y ofrece copiarlo, WhatsApp, correo y, en el celular, las demás apps del teléfono.
 */
function createShareMenu(binding: ShareBinding): ShareMenu {
  const container = document.createElement('div');
  container.className = 'maplibregl-ctrl map-menu';
  container.innerHTML = `
    <div class="map-menu-panel" id="share-menu-panel" hidden>
      <p class="map-menu-title">Compartir</p>
      <button type="button" class="map-menu-option" data-share-copy>
        <span><strong>Copiar enlace</strong><small>En un correo se pega con su título, no con la dirección larga.</small></span>
      </button>
      <a class="map-menu-option" data-share-whatsapp target="_blank" rel="noopener">
        <span><strong>WhatsApp</strong><small>Abre WhatsApp con el enlace listo; tú eliges a quién.</small></span>
      </a>
      <a class="map-menu-option" data-share-mail>
        <span><strong>Correo</strong><small>Abre un correo nuevo con el enlace.</small></span>
      </a>
      <button type="button" class="map-menu-option" data-share-system hidden>
        <span><strong>Más…</strong><small>Teams, Telegram y las demás apps del teléfono.</small></span>
      </button>
      <p class="map-menu-note">Quien lo abra recibe una copia: no toca la tuya.</p>
    </div>
    <div class="map-menu-panel" data-share-status role="status" hidden></div>
    <button type="button" class="map-menu-toggle" aria-expanded="false" aria-controls="share-menu-panel" title="Compartir" aria-label="Compartir">${SHARE_ICON}</button>`;

  const panel = container.querySelector<HTMLElement>('#share-menu-panel')!;
  const status = container.querySelector<HTMLElement>('[data-share-status]')!;
  const toggle = container.querySelector<HTMLButtonElement>('.map-menu-toggle')!;
  const whatsapp = container.querySelector<HTMLAnchorElement>('[data-share-whatsapp]')!;
  const mail = container.querySelector<HTMLAnchorElement>('[data-share-mail]')!;
  const system = container.querySelector<HTMLButtonElement>('[data-share-system]')!;
  system.hidden = !canUseSystemShare();

  // El enlace se arma al abrir el menú, así WhatsApp y Correo ya tienen su dirección cuando se tocan.
  let title = '';
  let url: Promise<string> = Promise.resolve('');
  let statusTimer = 0;

  const hideStatus = () => {
    window.clearTimeout(statusTimer);
    status.hidden = true;
  };
  const showStatus = (content: (string | Node)[], autoHide: boolean) => {
    window.clearTimeout(statusTimer);
    status.replaceChildren(...content);
    status.hidden = false;
    if (autoHide) statusTimer = window.setTimeout(hideStatus, COPIED_VISIBLE_MS);
  };
  /** Sin copiado automático: el enlace queda seleccionado para Ctrl+C. */
  const showUrl = async () => {
    const field = document.createElement('input');
    field.className = 'map-menu-url';
    field.readOnly = true;
    field.value = await url;
    field.setAttribute('aria-label', 'Enlace para compartir');
    showStatus(['No se pudo copiar solo. Copia este enlace:', field], false);
    field.select();
  };

  /**
   * En el celular el mapa es bajito y no cabe el menú encima del botón: entonces se abre a su
   * izquierda, pegado al borde de abajo del mapa, y si aun así no cabe se desplaza por dentro.
   */
  const fitToHost = () => {
    panel.style.removeProperty('right');
    panel.style.removeProperty('bottom');
    panel.style.removeProperty('max-height');
    const host = (container.closest('.maplibregl-map') ?? container.parentElement)?.getBoundingClientRect();
    if (!host) return;
    const button = toggle.getBoundingClientRect();
    if (panel.scrollHeight <= button.top - host.top - 20) return;
    panel.style.right = `${button.width + 10}px`;
    panel.style.bottom = `${button.bottom - host.bottom + 10}px`;
    panel.style.maxHeight = `${Math.round(host.height - 20)}px`;
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) return;
    hideStatus();
    fitToHost();
    title = binding.title();
    url = shareUrl(binding);
    whatsapp.removeAttribute('href');
    mail.removeAttribute('href');
    const opening = url;
    void opening.then((u) => {
      if (url !== opening) return;
      whatsapp.href = whatsappHref(title, u);
      mail.href = mailHref(title, u);
    });
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    hideStatus();
    if (!panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  container.querySelector('[data-share-copy]')!.addEventListener('click', () => {
    setOpen(false);
    void copyShareLink(title, url).then((copied) => (copied ? showStatus([COPIED_MESSAGE], true) : showUrl()));
  });
  for (const link of [whatsapp, mail]) link.addEventListener('click', () => setOpen(false));
  system.addEventListener('click', async () => {
    setOpen(false);
    try {
      await navigator.share({ title, url: await url });
    } catch (err) {
      // Cerrar el menú del teléfono sin elegir no es un error.
      if ((err as Error).name !== 'AbortError') await showUrl();
    }
  });

  const closeOnOutsideClick = (event: MouseEvent) => {
    if (container.contains(event.target as Node)) return;
    setOpen(false);
    hideStatus();
  };
  document.addEventListener('click', closeOnOutsideClick);

  return {
    element: container,
    destroy() {
      hideStatus();
      document.removeEventListener('click', closeOnOutsideClick);
      container.remove();
    },
  };
}

class ShareMenuControl implements IControl {
  constructor(private readonly menu: ShareMenu) {}

  onAdd(): HTMLElement {
    return this.menu.element;
  }

  onRemove(): void {
    this.menu.destroy();
  }
}

/** Agrega el botón "Compartir" sobre el mapa. Va después del de exportar para quedar encima de él. */
export function addShareControl(map: MapLibreMap, binding: ShareBinding): void {
  map.addControl(new ShareMenuControl(createShareMenu(binding)), 'bottom-right');
}

/** El mismo botón en un editor de planos (Interiores, Cavernas), encima del de exportar. */
export function addPlanShare(host: HTMLElement, binding: ShareBinding): { destroy(): void } {
  const menu = createShareMenu(binding);
  menu.element.classList.add('plan-share');
  host.append(menu.element);
  return menu;
}
