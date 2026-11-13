// Rutas de la app: cada simulación vive en su propia dirección (hertzo.site/interiores,
// hertzo.site/terreno?banda=uhf). La compilación deja una copia de la app en la carpeta de
// cada ruta, así cualquier hosting estático la sirve sin reglas de reescritura.

import type { ParseResult } from '../export/projectFile';
import { decodeShare, shareCodeFromHash } from '../export/shareLink';

export interface PageContext {
  root: HTMLElement;
  params: URLSearchParams;
  /** Datos de un enlace de "Compartir" (#d=…), sin revisar; null si la dirección no trae uno. */
  shared: ParseResult<Record<string, unknown>> | null;
}

/** Monta la página y devuelve la función que la desmonta (libera el mapa, cancela cálculos…). */
export type MountPage = (context: PageContext) => (() => void) | void;

export interface Route {
  path: string;
  title: string;
  load: () => Promise<MountPage>;
}

export interface ParsedLocation {
  path: string;
  params: URLSearchParams;
}

/** Punto, coma o paréntesis pegados al final de un enlace copiado de un texto. */
const TRAILING_PUNCTUATION = /[.,)]+$/;

/**
 * "/terreno/" + "?banda=uhf" → { path: "terreno", params: banda=uhf }. Solo cuenta el primer tramo.
 * Ignora la puntuación final de un enlace copiado: "/terreno." → terreno.
 */
export function parseLocation(pathname: string, search: string): ParsedLocation {
  const path = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  return { path: decodeURIComponent(path).replace(TRAILING_PUNCTUATION, ''), params: new URLSearchParams(search) };
}

/** Cambia un parámetro de la dirección sin recargar (por ejemplo la banda elegida). */
export function replaceQuery(key: string, value: string | null): void {
  const params = new URLSearchParams(location.search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
}

export async function startRouter(
  root: HTMLElement,
  routes: Route[],
  fallbackPath: string,
  onNavigate: (route: Route) => void,
): Promise<void> {
  const { path, params } = parseLocation(location.pathname, location.search);
  const route = routes.find((r) => r.path === path) ?? routes.find((r) => r.path === fallbackPath)!;
  const dirtyPath = TRAILING_PUNCTUATION.test(decodeURIComponent(location.pathname));
  if (route.path !== path || dirtyPath) history.replaceState(null, '', `/${route.path}${location.search}`);
  onNavigate(route);
  const code = shareCodeFromHash(location.hash);
  const [mount, shared] = await Promise.all([route.load(), code ? decodeShare(code) : null]);
  // Ya leído, el enlace sale de la barra de direcciones: lo que cambies después no lo actualiza,
  // y copiarla de ahí no debe pasar por la versión que te mandaron.
  if (code) history.replaceState(null, '', `${location.pathname}${location.search}`);
  mount({ root, params, shared });
  // Un enlace pegado en una pestaña que ya está en esa dirección solo cambia el "#" y el
  // navegador no recarga: se recarga a mano para abrirlo.
  window.addEventListener('hashchange', () => {
    if (shareCodeFromHash(location.hash)) location.reload();
  });
}
