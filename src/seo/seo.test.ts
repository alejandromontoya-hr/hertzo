import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../pages/scenarios';
import { AI_BOTS, PAGES, headTags, llmsTxt, notFoundHeadTags, pageMeta, robotsTxt, sitemapXml, structuredData } from './seo';

type Node = Record<string, unknown>;
const graph = (path: string) => (structuredData(path) as { '@graph': Node[] })['@graph'];

describe('páginas', () => {
  it('ocho páginas: inicio, escenarios y los seis escenarios', () => {
    expect(PAGES.map((p) => p.path)).toEqual([
      '',
      'escenarios',
      'terreno',
      'radiodifusion',
      'celular',
      'enlace',
      'interiores',
      'cavernas',
    ]);
  });

  it('terreno → «Cobertura de radio P25 y trunking sobre terreno | Hertzo»', () => {
    expect(pageMeta('terreno')!.title).toBe('Cobertura de radio P25 y trunking sobre terreno | Hertzo');
  });

  it('la principal empieza por lo que hace y deja la marca al final', () => {
    expect(pageMeta('')!.title).toBe('Simulador abierto de propagación RF | Hertzo');
  });

  it('todos los títulos terminan en « | Hertzo»', () => {
    for (const page of PAGES) expect(page.title.endsWith(' | Hertzo'), page.title).toBe(true);
  });

  it('los títulos caben en Google (≤ 60 caracteres) y las descripciones también (≤ 160)', () => {
    for (const page of PAGES) {
      expect(page.title.length, page.title).toBeLessThanOrEqual(60);
      expect(page.description.length, page.description).toBeLessThanOrEqual(160);
    }
  });

  it('cada página tiene fecha AAAA-MM-DD', () => {
    for (const page of PAGES) expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('headTags', () => {
  it('la dirección oficial de /terreno?banda=uhf es https://hertzo.site/terreno', () => {
    expect(headTags('terreno')).toContain('<link rel="canonical" href="https://hertzo.site/terreno" />');
  });

  it('la principal apunta a la raíz con barra final', () => {
    expect(headTags('')).toContain('<link rel="canonical" href="https://hertzo.site/" />');
  });

  it('vista previa al compartir con imagen absoluta de 1200 × 630', () => {
    const head = headTags('interiores');
    expect(head).toContain('<meta property="og:image" content="https://hertzo.site/og.png" />');
    expect(head).toContain('<meta property="og:image:width" content="1200" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('un "</script>" en un texto no cierra el bloque de datos estructurados', () => {
    const head = headTags('enlace');
    const json = head.slice(head.indexOf('application/ld+json') + 21);
    expect(json.indexOf('</script>')).toBe(json.length - '</script>'.length);
  });

  it('página desconocida → error', () => {
    expect(() => headTags('no-existe')).toThrow();
  });

  it('la 404 pide no guardarse en los buscadores', () => {
    expect(notFoundHeadTags()).toContain('<meta name="robots" content="noindex" />');
  });
});

describe('structuredData', () => {
  it('la principal describe el sitio, la app gratuita y el autor', () => {
    const types = graph('').map((n) => n['@type']);
    expect(types).toEqual(['WebSite', 'WebApplication', 'Person']);
    const app = graph('')[1]!;
    expect(app.isAccessibleForFree).toBe(true);
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(app.featureList).toHaveLength(6);
  });

  it('cavernas → migas Inicio › Escenarios › Cavernas, túneles y minas', () => {
    const page = graph('cavernas')[0]!;
    const crumbs = (page.breadcrumb as { itemListElement: Node[] }).itemListElement;
    expect(crumbs.map((c) => c.name)).toEqual(['Inicio', 'Escenarios', 'Cavernas, túneles y minas']);
    expect(crumbs[2]!.item).toBe('https://hertzo.site/cavernas');
  });

  it('escenarios lista los seis escenarios en orden', () => {
    const page = graph('escenarios')[0]!;
    expect(page['@type']).toBe('CollectionPage');
    const items = (page.mainEntity as { itemListElement: Node[] }).itemListElement;
    expect(items.map((i) => i.url)).toEqual(SCENARIOS.map((s) => `https://hertzo.site/${s.path}`));
  });
});

describe('robots.txt', () => {
  it('deja leer todo, nombra a los bots de IA y señala el sitemap', () => {
    const robots = robotsTxt();
    expect(robots.startsWith('User-agent: *\nAllow: /\n')).toBe(true);
    for (const bot of AI_BOTS) expect(robots).toContain(`User-agent: ${bot}\n`);
    expect(robots).toContain('Sitemap: https://hertzo.site/sitemap.xml');
    expect(robots).not.toContain('Disallow');
  });
});

describe('sitemap.xml', () => {
  it('ocho direcciones, sin variantes con parámetros', () => {
    const xml = sitemapXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(8);
    expect(locs[0]).toBe('https://hertzo.site/');
    expect(locs.some((l) => l!.includes('?'))).toBe(false);
  });
});

describe('llms.txt', () => {
  it('empieza con el nombre y un resumen en cita, como pide llmstxt.org', () => {
    const lines = llmsTxt().split('\n');
    expect(lines[0]).toBe('# Hertzo');
    expect(lines[2]!.startsWith('> ')).toBe(true);
  });

  it('trae cada escenario con su dirección y sus variantes', () => {
    const text = llmsTxt();
    for (const s of SCENARIOS) {
      expect(text).toContain(`### [${s.title}](https://hertzo.site/${s.path})`);
      for (const o of s.options) expect(text).toContain(`(https://hertzo.site${o.href})`);
    }
  });
});
