# Hertzo

Simulador web de propagación RF, gratuito y open source, pensado primero para radio profesional y ampliado a radiodifusión, celular, enlaces, interiores y cavernas.

Al entrar eliges qué quieres simular y se abre una página especializada: no se simula igual una repetidora en la montaña que un WiFi en una casa o una radio dentro de una mina. Cada página trae su modelo de propagación y su entorno.

Todo corre en tu navegador: sin servidores, sin cuentas y sin costo.

**Estado:** radio profesional en terreno funcional y en validación con sitios reales; las demás páginas son primeras versiones funcionales. Detalle en [docs/ESCENARIOS.md](docs/ESCENARIOS.md).

- Sitio: https://hertzo.site (próximamente)

## Escenarios

Cada simulación tiene su propia dirección. La raíz (`hertzo.site/`) es la página principal: qué hace Hertzo y la entrada a los escenarios.

| Dirección | Escenario | Entorno | Qué calcula |
| --- | --- | --- | --- |
| `/escenarios` | Selector "¿Qué quieres simular?" | — | Enlaces a cada escenario y sus variantes |
| `/terreno` | Radiocomunicaciones en terreno (VHF, UHF, 700, 800 MHz) | Mapa con relieve | Bajada, subida y desbalance de un sitio, con su balance de enlace (ITM de NTIA) |
| `/radiodifusion` | Radiodifusión FM y AM | Mapa con relieve | Campo en dBµV/m y zonas de servicio; AM con onda de tierra según el suelo |
| `/celular` | Celular LTE / 5G | Mapa con relieve | RSRP, mejor sector y SINR de un sitio con sectores (Hata, 3GPP 38.901 o ITM) |
| `/enlace` | Enlaces punto a punto | Mapa y perfil | Zona de Fresnel, difracción, nivel recibido, margen y disponibilidad |
| `/interiores` | Interiores WiFi (2,4, 5, 6 GHz) | Editor de planos | Mapa de calor con muros de distintos materiales y varios access points |
| `/cavernas` | Cavernas, túneles y minas | Editor de galerías | Señal por la red de galerías, curvas y cable radiante |

Las variantes van como parámetros: `/terreno?banda=uhf`, `/radiodifusion?servicio=am`, `/interiores?plano=oficina`, `/cavernas?escenario=mina`.

## Desarrollo

Requiere Node.js 22.12 o superior (lo exige Vitest).

```bash
npm install
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run build` | Compila el sitio estático en `dist/` |
| `npm run preview` | Sirve `dist/` para probar la compilación |
| `npm run build:wasm` | Recompila el motor ITM (C++ → WebAssembly). Solo si cambia el C++; ver [engine/README.md](engine/README.md) |
| `npm run indexnow` | Le avisa a Bing que el sitio cambió. Se corre después de publicar |

## Publicar

`npm run build` genera archivos estáticos en `dist/`:

- `dist/index.html`: la página principal del sitio (su fuente es `index.html` y `src/landing.ts`).
- `dist/<dirección>/index.html`: una copia de la app por cada dirección (`terreno`, `interiores`…), más `dist/404.html`. La fuente de la app es `simulador.html`.

Así cualquier hosting estático (Cloudflare Pages, GitHub Pages) sirve `hertzo.site/interiores` sin reglas de reescritura ni claves. El sitio debe ir en la raíz del dominio: las rutas de los archivos son absolutas (`/assets/…`).

### Buscadores y asistentes de IA

Lo que leen Google, Bing, ChatGPT, Claude o Perplexity sale de [src/seo/seo.ts](src/seo/seo.ts) al compilar:

- Cada página lleva su título, descripción, dirección oficial (`/terreno?banda=uhf` cuenta como `/terreno`), vista previa al compartir (`public/og.png`) y datos estructurados de schema.org.
- `dist/robots.txt` deja leer todo el sitio y nombra a los bots de IA; `dist/sitemap.xml` trae las 8 páginas; `dist/llms.txt` resume el sitio para asistentes de IA ([llmstxt.org](https://llmstxt.org)).
- La lista de escenarios de la página principal ya va escrita en `dist/index.html`, para quien no ejecuta JavaScript.

Al cambiar lo que dice una página, se actualiza su fecha en `UPDATED` de `src/seo/seo.ts`; al publicar, se corre `npm run indexnow`. Si cambia el texto de la portada, `node docs/marca/generar-imagen-compartir.mjs` vuelve a dibujar `public/og.png`.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/rf/` | Física pura: unidades, balance de enlace, campo, onda de tierra, celular, Fresnel, interiores y túneles |
| `src/geo/` | Geodesia: distancias, rumbos, puntos de destino |
| `src/terrain/` | Teselas de terreno, caché y perfiles |
| `src/propagation/` | Interfaz común de motores (`PropagationEngine`): ITM, onda de tierra, Hata y 3GPP |
| `src/coverage/` | Radiales, hilos de cálculo, recálculo e imagen de cobertura |
| `src/indoor/` | Plano de interiores, mapa de calor y planos de ejemplo |
| `src/cave/` | Red de galerías, propagación guiada y escenarios de ejemplo |
| `src/editor/` | Vista de plano 2D compartida por los editores |
| `src/pages/` | Portada, rutas y una carpeta por escenario |
| `src/seo/` | Títulos, descripciones, datos estructurados, robots.txt, sitemap.xml y llms.txt |
| `src/map/` | Mapa, marcadores y capas |
| `src/ui/` | Formularios, panel de balance, leyenda y lecturas |
| `engine/` | Código C++ del motor y script de compilación a WebAssembly |

## Aviso

Hertzo es una herramienta de planificación. Sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados, en especial para sistemas de misión crítica.

## Créditos

Modelo ITM de NTIA (dominio público), mapa © colaboradores de OpenStreetMap, terreno de AWS Terrain Tiles (SRTM y GMTED2010 de USGS, entre otras fuentes) y MapLibre GL JS. Lista completa en [THIRD_PARTY.md](THIRD_PARTY.md) y en "Créditos y licencias" dentro de la app.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Montoya
