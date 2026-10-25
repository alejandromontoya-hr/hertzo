import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { landingScenarioList } from './src/landingList';
import { APP_PATHS, CHOOSER_PATH } from './src/pages/scenarios';
import { headTags, llmsTxt, notFoundHeadTags, robotsTxt, sitemapXml } from './src/seo/seo';

/** Plantilla de la app; la raíz (index.html) queda libre para la página principal del sitio. */
const APP_HTML = 'simulador.html';

/** Marca en el <head> de index.html y simulador.html donde van el título, la descripción y lo demás de src/seo/seo.ts. */
const SEO_MARK = '<!--seo-->';

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
      // Cada copia lleva su propio título, descripción y dirección oficial, para que Google no
      // vea siete páginas iguales.
      const built = join(outDir, APP_HTML);
      const template = readFileSync(built, 'utf8');
      if (!template.includes(SEO_MARK)) throw new Error(`Falta ${SEO_MARK} en ${APP_HTML}`);
      for (const path of APP_PATHS) {
        mkdirSync(join(outDir, path), { recursive: true });
        writeFileSync(join(outDir, path, 'index.html'), template.replace(SEO_MARK, headTags(path)));
      }
      writeFileSync(join(outDir, '404.html'), template.replace(SEO_MARK, notFoundHeadTags()));
      rmSync(built);
    },
  };
}

/** Archivos para buscadores y asistentes de IA que salen de src/seo/seo.ts. */
const SEO_FILES: Record<string, { type: string; body: () => string }> = {
  'robots.txt': { type: 'text/plain', body: robotsTxt },
  'sitemap.xml': { type: 'application/xml', body: sitemapXml },
  'llms.txt': { type: 'text/plain', body: llmsTxt },
};

/**
 * Lo que leen Google, Bing y los asistentes de IA:
 * - en el <head> de cada página, su título, descripción, vista previa y datos estructurados;
 * - en index.html, la lista de escenarios ya escrita, para quien no ejecuta JavaScript;
 * - robots.txt, sitemap.xml y llms.txt en la raíz del sitio.
 * En desarrollo cada dirección de la app recibe su propio <head>; al compilar lo pone appRoutes().
 */
function seo(): Plugin {
  return {
    name: 'hertzo-seo',
    transformIndexHtml(html, ctx) {
      if (ctx.path === '/index.html') {
        return html
          .replace(SEO_MARK, headTags(''))
          .replace(/(<ul [^>]*data-scenarios[^>]*>)(<\/ul>)/, `$1${landingScenarioList()}$2`);
      }
      // Al compilar no se sabe a qué dirección irá cada copia: la marca queda para appRoutes().
      if (!ctx.originalUrl) return html;
      return html.replace(SEO_MARK, headTags(appPathOf(ctx.originalUrl) ?? CHOOSER_PATH));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = SEO_FILES[(req.url ?? '').slice(1)];
        if (!file) return next();
        res.setHeader('Content-Type', `${file.type}; charset=utf-8`);
        res.end(file.body());
      });
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(SEO_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: file.body() });
      }
    },
  };
}

export default defineConfig({
  // El sitio vive en la raíz del dominio (hertzo.site); las rutas de los archivos son absolutas
  // para que funcionen igual desde /interiores/ que desde /terreno/.
  base: '/',
  plugins: [seo(), appRoutes()],
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
