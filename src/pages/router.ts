// Rutas de la app con `#` en la dirección (#/terreno?banda=uhf). Funciona en cualquier
// hosting estático porque el servidor siempre entrega el mismo index.html.

export interface PageContext {
  root: HTMLElement;
  params: URLSearchParams;
}

/** Monta la página y devuelve la función que la desmonta (libera el mapa, cancela cálculos…). */
export type MountPage = (context: PageContext) => (() => void) | void;

export interface Route {
  path: string;
  title: string;
  load: () => Promise<MountPage>;
}

export interface ParsedHash {
  path: string;
  params: URLSearchParams;
}

/** "#/terreno?banda=uhf" → { path: "terreno", params: banda=uhf } */
export function parseHash(hash: string): ParsedHash {
  const clean = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = clean.split('?');
  return { path: path.replace(/\/+$/, ''), params: new URLSearchParams(query) };
}

export function startRouter(
  root: HTMLElement,
  routes: Route[],
  onNavigate: (route: Route) => void,
): void {
  let unmount: (() => void) | void;
  let navigation = 0;

  const show = async () => {
    const { path, params } = parseHash(location.hash);
    const route = routes.find((r) => r.path === path) ?? routes[0]!;
    const current = ++navigation;
    const mount = await route.load();
    if (current !== navigation) return; // el usuario ya se fue a otra página
    unmount?.();
    root.replaceChildren();
    root.scrollTop = 0;
    onNavigate(route);
    unmount = mount({ root, params });
  };

  window.addEventListener('hashchange', () => {
    // Cambiar solo los parámetros de la misma página (por ejemplo la banda) no la vuelve a montar.
    const { path } = parseHash(location.hash);
    if (path === lastPath) return;
    lastPath = path;
    void show();
  });
  let lastPath = parseHash(location.hash).path;
  void show();
}
