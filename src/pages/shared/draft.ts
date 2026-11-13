// La simulación de cada página queda guardada en este navegador mientras la editas: al cerrar
// la pestaña y volver, sigue donde quedaste. Se guarda lo mismo que lleva el enlace de
// "Compartir" (y se revisa con el mismo lector al abrir), más los ajustes de la dirección
// (?banda=800&entorno=urbano). Del navegador: usa localStorage y sessionStorage.
//
// Tres casos:
// - Vuelves: la página abre con lo guardado.
// - "Empezar de nuevo": lo guardado pasa a "Deshacer" (solo en esta pestaña) y la página abre limpia.
// - Abres un enlace que te mandaron: lo tuyo queda aparte y el aviso ofrece "Volver a la tuya".

import { isRecord } from '../../export/projectFile';
import { SHARE_VERSION } from '../../export/shareLink';

export interface Draft {
  /** La dirección sin la ruta, por ejemplo "?banda=800&entorno=urbano" ("" sin ajustes). */
  search: string;
  /** Los mismos datos del enlace de "Compartir". */
  data: Record<string, unknown>;
  /** Empezó con un enlace de otra persona: no reemplaza lo tuyo que quedó aparte. */
  fromLink: boolean;
}

/** Lo guardado, o null si no hay o no tiene la forma esperada (de una versión vieja, por ejemplo). */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  // De otra versión de Hertzo: no se intenta leer (la página abre con sus valores de siempre).
  if (!isRecord(value) || value.v !== SHARE_VERSION || typeof value.search !== 'string' || !isRecord(value.data)) return null;
  if (value.search !== '' && !value.search.startsWith('?')) return null;
  return { search: value.search, data: value.data, fromLink: value.fromLink === true };
}

const draftKey = (page: string) => `hertzo:borrador:${page}`;
/** Lo tuyo mientras ves un enlace que te mandaron. */
const ownKey = (page: string) => `hertzo:borrador-propio:${page}`;
/** Lo que había antes de "Empezar de nuevo", para "Deshacer" (solo en esta pestaña). */
const restartKey = (page: string) => `hertzo:antes-de-empezar:${page}`;

function read(storage: () => Storage, key: string): Draft | null {
  try {
    return parseDraft(storage().getItem(key));
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, draft: Draft | null): void {
  try {
    if (draft) storage().setItem(key, JSON.stringify({ v: SHARE_VERSION, ...draft }));
    else storage().removeItem(key);
  } catch {
    // Sin almacenamiento (ventana privada, o lleno): la simulación simplemente no se recuerda.
  }
}

const local = () => localStorage;
const session = () => sessionStorage;

export interface DraftSession {
  /** Los ajustes de la dirección con que abre la página: los de la dirección o, si no trae, los guardados. */
  params: URLSearchParams;
  /** Lo guardado para abrir la página; null si abrió con un enlace o no había nada. */
  data: Record<string, unknown> | null;
  /** Estás viendo un enlace y lo tuyo quedó aparte: el aviso ofrece "Volver a la tuya". */
  hasOwn: boolean;
  /** Acabas de pulsar "Empezar de nuevo": el aviso ofrece "Deshacer". */
  restarted: boolean;
  /** Empieza a guardar solo; `data` da lo que hay en la página. */
  start(root: HTMLElement, data: () => Record<string, unknown>): void;
  /** "Empezar de nuevo": guarda lo de ahora para "Deshacer" y recarga la página limpia. */
  startOver(): void;
  /** "Deshacer" después de "Empezar de nuevo". */
  undoStartOver(): void;
  /** "Volver a la tuya": deja el enlace y abre lo tuyo. */
  backToOwn(): void;
  stop(): void;
}

/** Cada cuánto, como mucho, se escribe mientras editas (al cerrar la pestaña se escribe siempre). */
const SAVE_DELAY_MS = 400;

/**
 * Lee lo guardado de `page` ("terreno", "lora"…) al abrir la página. `params` es la dirección y
 * `hasLink` dice si abrió con un enlace de "Compartir" (aunque venga dañado).
 */
export function openDraft(page: string, params: URLSearchParams, hasLink: boolean): DraftSession {
  const saved = read(local, draftKey(page));
  let fromLink = hasLink || (saved?.fromLink ?? false);
  // Un enlace nuevo sobre lo tuyo: lo tuyo queda aparte. Si lo guardado ya era de otro enlace, lo
  // tuyo ya estaba aparte y no se pisa.
  if (hasLink && saved && !saved.fromLink) write(local, ownKey(page), saved);
  const hasOwn = fromLink && read(local, ownKey(page)) !== null;

  const before = hasLink ? null : read(session, restartKey(page));
  write(session, restartKey(page), null);

  let openParams = params;
  if (!hasLink && saved && [...params].length === 0 && saved.search) {
    openParams = new URLSearchParams(saved.search);
    history.replaceState(null, '', `${location.pathname}${saved.search}`);
  }

  let current: (() => Record<string, unknown>) | null = null;
  let timer = 0;
  let stopped = false;
  const save = () => {
    window.clearTimeout(timer);
    if (stopped || !current) return;
    write(local, draftKey(page), { search: location.search, data: current(), fromLink });
  };
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') save();
  };
  let root: HTMLElement | null = null;
  const EDIT_EVENTS = ['input', 'change', 'click', 'pointerup', 'keyup'] as const;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', save);
    for (const type of EDIT_EVENTS) root?.removeEventListener(type, later, true);
  };
  /** Recarga la página con otra simulación guardada, sin que lo de ahora la pise al salir. */
  const reopen = (search: string) => {
    stop();
    location.replace(`${location.pathname}${search}`);
  };

  return {
    params: openParams,
    data: hasLink ? null : (saved?.data ?? null),
    hasOwn,
    restarted: before !== null,
    start(pageRoot, data) {
      root = pageRoot;
      current = data;
      // Cualquier cambio en la página (campos, clic en el mapa, arrastrar un marcador) agenda un
      // guardado; ocultar o cerrar la pestaña guarda ya.
      for (const type of EDIT_EVENTS) pageRoot.addEventListener(type, later, true);
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', save);
      save();
    },
    startOver() {
      save();
      write(session, restartKey(page), read(local, draftKey(page)));
      write(local, draftKey(page), null);
      fromLink = false;
      reopen('');
    },
    undoStartOver() {
      const previous = before ?? read(session, restartKey(page));
      if (!previous) return;
      write(local, draftKey(page), previous);
      reopen(previous.search);
    },
    backToOwn() {
      const own = read(local, ownKey(page));
      if (!own) return;
      write(local, draftKey(page), own);
      write(local, ownKey(page), null);
      reopen(own.search);
    },
    stop,
  };
}

export const START_OVER_HTML = `<button type="button" class="link-button start-over" data-start-over title="Deja la página con los valores de siempre; puedes deshacerlo">Empezar de nuevo</button>`;
