// Lo que leen Google, Bing y los asistentes de IA (ChatGPT, Claude, Perplexity): título y
// descripción de cada página, vista previa al compartir, datos estructurados, robots.txt,
// sitemap.xml y llms.txt. Módulo puro: lo usa la configuración de Vite al compilar y la app para
// el título de la pestaña, así los dos dicen lo mismo.

import { CHOOSER_PATH, SCENARIOS, type Scenario } from '../pages/scenarios';

export const SITE = {
  name: 'Hertzo',
  url: 'https://hertzo.site',
  tagline: 'Simulador abierto de propagación RF',
  repo: 'https://github.com/alejandromontoya-hr/hertzo',
  author: {
    name: 'Alejandro Montoya',
    linkedin: 'https://www.linkedin.com/in/alejandromontoya-hr',
    github: 'https://github.com/alejandromontoya-hr',
  },
  /** Fondo de la página; el navegador del celular pinta la barra de arriba con este color. */
  themeColor: '#f3f0e7',
  /** Imagen de la vista previa al compartir en WhatsApp, LinkedIn o X (public/og.png). */
  image: {
    path: '/og.png',
    width: 1200,
    height: 630,
    alt: 'Hertzo: predice la cobertura de tu radio antes de subir a la torre.',
  },
} as const;

export interface PageMeta {
  /** '' es la página principal; 'terreno' es hertzo.site/terreno. */
  path: string;
  /** Título completo de la pestaña y de Google. */
  title: string;
  description: string;
  /** Fecha del último cambio de contenido (AAAA-MM-DD), para el sitemap. */
  updated: string;
}

/**
 * Fecha del último cambio de contenido de cada página. Al cambiar lo que dice una página, se
 * actualiza su fecha: Google deja de creerle al sitemap si las fechas cambian sin motivo.
 */
const UPDATED: Record<string, string> = {
  '': '2026-10-25',
  [CHOOSER_PATH]: '2026-10-25',
  terreno: '2026-10-25',
  radiodifusion: '2026-10-25',
  celular: '2026-10-25',
  enlace: '2026-10-25',
  interiores: '2026-10-25',
  cavernas: '2026-10-25',
};

const scenarioMeta = (s: Scenario): PageMeta => ({
  path: s.path,
  title: `${s.pageTitle} · ${SITE.name}`,
  description: s.description,
  updated: UPDATED[s.path]!,
});

/** Todas las páginas del sitio, en el orden del sitemap y de llms.txt. */
export const PAGES: readonly PageMeta[] = [
  {
    path: '',
    title: `${SITE.name} · ${SITE.tagline}`,
    description:
      'Simulador abierto de propagación RF: radio profesional sobre terreno real con bajada y subida por separado, FM y AM, celular, enlaces, WiFi y túneles. Gratis.',
    updated: UPDATED['']!,
  },
  {
    path: CHOOSER_PATH,
    title: `Escenarios de simulación RF · ${SITE.name}`,
    description:
      'Elige qué simular: radio profesional en terreno, radiodifusión FM y AM, celular LTE y 5G, enlaces punto a punto, WiFi en interiores o túneles y minas.',
    updated: UPDATED[CHOOSER_PATH]!,
  },
  ...SCENARIOS.map(scenarioMeta),
];

export function pageMeta(path: string): PageMeta | undefined {
  return PAGES.find((p) => p.path === path);
}

/** "" → "https://hertzo.site/"; "terreno" → "https://hertzo.site/terreno". */
export const pageUrl = (path: string) => `${SITE.url}/${path}`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** JSON dentro de <script>: un "</script>" en un texto no puede cerrar la etiqueta. */
const jsonScript = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// Identificadores de los datos estructurados: cada página apunta al mismo sitio, app y autor.
const WEBSITE_ID = `${SITE.url}/#sitio`;
const APP_ID = `${SITE.url}/#app`;
const AUTHOR_ID = `${SITE.url}/#autor`;

const author = {
  '@type': 'Person',
  '@id': AUTHOR_ID,
  name: SITE.author.name,
  url: SITE.author.linkedin,
  sameAs: [SITE.author.linkedin, SITE.author.github],
};

/** Datos estructurados (schema.org) de una página, para Google, Bing y los asistentes de IA. */
export function structuredData(path: string): object {
  const page = pageMeta(path);
  if (!page) throw new Error(`Página desconocida: "${path}"`);

  if (path === '') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': WEBSITE_ID,
          name: SITE.name,
          alternateName: `${SITE.name} · ${SITE.tagline}`,
          url: pageUrl(''),
          description: page.description,
          inLanguage: 'es',
          publisher: { '@id': AUTHOR_ID },
        },
        {
          '@type': 'WebApplication',
          '@id': APP_ID,
          name: SITE.name,
          url: pageUrl(''),
          description: page.description,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Web',
          browserRequirements: 'Navegador moderno con WebAssembly y WebGL',
          inLanguage: 'es',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          license: 'https://opensource.org/licenses/MIT',
          image: `${SITE.url}${SITE.image.path}`,
          featureList: SCENARIOS.map((s) => `${s.title}: ${s.computes}`),
          author: { '@id': AUTHOR_ID },
          sameAs: [SITE.repo],
        },
        author,
      ],
    };
  }

  const crumbs = [
    { name: 'Inicio', url: pageUrl('') },
    { name: 'Escenarios', url: pageUrl(CHOOSER_PATH) },
  ];
  const scenario = SCENARIOS.find((s) => s.path === path);
  if (scenario) crumbs.push({ name: scenario.title, url: pageUrl(path) });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': scenario ? 'WebPage' : 'CollectionPage',
        '@id': pageUrl(path),
        url: pageUrl(path),
        name: page.title,
        description: page.description,
        inLanguage: 'es',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': APP_ID },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
        },
        ...(!scenario && {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: SCENARIOS.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: s.title,
              url: pageUrl(s.path),
            })),
          },
        }),
      },
    ],
  };
}

/** Lo que va en el <head> de una página: título, descripción, dirección oficial, vista previa y datos estructurados. */
export function headTags(path: string): string {
  const page = pageMeta(path);
  if (!page) throw new Error(`Página desconocida: "${path}"`);
  const url = pageUrl(path);
  const image = `${SITE.url}${SITE.image.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    // Las variantes (/terreno?banda=uhf) son la misma página: cuentan como /terreno.
    `<link rel="canonical" href="${url}" />`,
    `<meta name="theme-color" content="${SITE.themeColor}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE.name}" />`,
    `<meta property="og:locale" content="es_CO" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${SITE.image.width}" />`,
    `<meta property="og:image:height" content="${SITE.image.height}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(SITE.image.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<link rel="llms-txt" href="/llms.txt" />`,
    jsonScript(structuredData(path)),
  ].join('\n    ');
}

/** <head> de la página de dirección inexistente (404.html): que ningún buscador la guarde. */
export function notFoundHeadTags(): string {
  return [
    `<title>Página no encontrada · ${SITE.name}</title>`,
    `<meta name="robots" content="noindex" />`,
    `<meta name="theme-color" content="${SITE.themeColor}" />`,
  ].join('\n    ');
}

/** Buscadores con inteligencia artificial: se nombran para dejar explícito que pueden leer el sitio. */
export const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'Meta-ExternalAgent',
  'CCBot',
  'cohere-ai',
  'MistralAI-User',
  'DuckAssistBot',
] as const;

export function robotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    ...AI_BOTS.map((bot) => `User-agent: ${bot}`),
    'Allow: /',
    '',
    `Sitemap: ${SITE.url}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(): string {
  const urls = PAGES.map(
    (p) => `  <url>
    <loc>${pageUrl(p.path)}</loc>
    <lastmod>${p.updated}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p.path === '' ? '1.0' : p.path === CHOOSER_PATH ? '0.9' : '0.8'}</priority>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/** Resumen del sitio para asistentes de IA, en el formato de llmstxt.org. */
export function llmsTxt(): string {
  const scenario = (s: Scenario) => `### [${s.title}](${pageUrl(s.path)})

${s.summary}

- Calcula: ${s.computes}
- Modelo: ${s.model}
- Variantes: ${s.options.map((o) => `[${o.label}](${SITE.url}${o.href})`).join(', ')}
`;

  return `# ${SITE.name}

> Simulador web de propagación RF, gratuito y de código abierto (licencia MIT), pensado primero para radio profesional: P25, trunking, convencional y punto a punto. Calcula la cobertura sobre el terreno real con la bajada y la subida por separado, y todo corre en el navegador: sin servidores, sin cuentas y sin costo.

Hertzo predice la cobertura de un sitio de radio antes de instalarlo. En radio profesional dibuja por separado la bajada (de la repetidora a los radios) y la subida (de los radios a la repetidora), porque cada una tiene su potencia, sus ganancias y sus pérdidas: en un sitio UHF de ejemplo la bajada aguanta 155,7 dB de pérdida y la subida solo 145,5 dB, así que la subida limita la cobertura por 10,2 dB y hay zonas donde se oye la repetidora pero ella no oye al radio. Además simula radiodifusión FM y AM, celular LTE y 5G, enlaces punto a punto, WiFi en interiores y radio en túneles, minas y cavernas.

Es una herramienta de planificación: sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados.

Sitio web: ${SITE.url}
Código fuente: ${SITE.repo}
Autor: ${SITE.author.name} (${SITE.author.linkedin})
Idioma: español

## Páginas principales

- [Inicio](${pageUrl('')}): Qué hace Hertzo, por qué separa la bajada de la subida y la entrada a los seis escenarios.
- [Escenarios](${pageUrl(CHOOSER_PATH)}): Selector «¿Qué quieres simular?» con cada escenario y sus variantes.

## Escenarios

${SCENARIOS.map(scenario).join('\n')}
## Cómo funciona

- Motor de terreno: Irregular Terrain Model (Longley-Rice) v1.4 de NTIA, sin modificaciones, compilado a WebAssembly y ejecutado en Web Workers del navegador.
- Terreno: Terrain Tiles de AWS Open Data (SRTM, GMTED2010 y otras fuentes); en Antioquia el píxel mide unos 38 m.
- Mapa base: OpenStreetMap y OpenTopoMap, dibujados con MapLibre GL JS.
- Unidades: potencia en W y dBm, ganancias en dBi o dBd, pérdidas en dB, frecuencia en MHz y distancias en km y m.
- Sin backend ni base de datos: el sitio son archivos estáticos y los cálculos se hacen en el equipo de quien lo usa.

## Accesos directos

- [Empezar a simular](${pageUrl(CHOOSER_PATH)})
- [Probar terreno UHF](${SITE.url}/terreno?banda=uhf)
- [Código fuente en GitHub](${SITE.repo})
- [Contacto en LinkedIn](${SITE.author.linkedin})
`;
}
