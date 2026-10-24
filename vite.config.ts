import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { APP_PATHS } from './src/pages/scenarios';

/** Plantilla de la app; la raíz (index.html) queda libre para la página principal del sitio. */
const APP_HTML = 'simulador.html';

/** "/interiores", "/interiores/" o "/interiores?plano=casa" → "interiores"; otra dirección → null. */
function appPathOf(url: string): string | null {
  const first = url.split('?')[0]!.replace(/^\/+/, '').split('/')[0]!;
  return APP_PATHS.includes(first) ? first : null;
}

/**
 * Cada simulación en su propia dirección (hertzo.site/interiores):
 * - en desarrollo y vista previa, esas direcciones sirven la app;
 * - al compilar, la app queda copiada en dist/<ruta>/index.html y en dist/404.html, así
 *   cualquier hosting estático la sirve sin reglas de reescritura.
 */
function appRoutes(): Plugin {
  let outDir = 'dist';
  const rewrite =
    (target: (path: string) => string): Connect.NextHandleFunction =>
    (req, _res, next) => {
      const path = req.url ? appPathOf(req.url) : null;
      if (path) {
        const query = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        req.url = target(path) + query;
      }
      next();
    };
  return {
    name: 'hertzo-rutas',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(rewrite(() => `/${APP_HTML}`));
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite((path) => `/${path}/index.html`));
    },
    closeBundle() {
      const built = join(outDir, APP_HTML);
      for (const path of APP_PATHS) {
        mkdirSync(join(outDir, path), { recursive: true });
        copyFileSync(built, join(outDir, path, 'index.html'));
      }
      copyFileSync(built, join(outDir, '404.html'));
      rmSync(built);
    },
  };
}

export default defineConfig({
  // El sitio vive en la raíz del dominio (hertzo.site); las rutas de los archivos son absolutas
  // para que funcionen igual desde /interiores/ que desde /terreno/.
  base: '/',
  plugins: [appRoutes()],
  build: {
    // MapLibre por sí solo pesa ~1 MB; el aviso por defecto (500 kB) saltaría siempre.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: { index: 'index.html', simulador: APP_HTML },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
