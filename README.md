# Hertzo

Simulador web de propagación RF, gratuito y de código abierto, pensado primero para radio profesional y ampliado a celular, WiFi, LoRaWAN, enlaces, radiodifusión y túneles.

Al entrar eliges qué quieres simular y se abre una página especializada: no se simula igual una repetidora en la montaña que un WiFi en una casa, un gateway LoRaWAN con sus medidores o una radio dentro de una mina. Cada página trae su modelo de propagación y su entorno, y calcula la bajada y la subida por separado.

Todo corre en tu navegador: sin servidores, sin cuentas y sin costo.

**Estado:** las siete páginas funcionan y sus cálculos se revisaron contra las normas (NTIA, UIT, 3GPP, TIA TSB-88) y las hojas técnicas de equipos reales; falta validarlas con mediciones de sitios reales. Detalle de cada modelo, sus valores por omisión y sus límites en [docs/ESCENARIOS.md](docs/ESCENARIOS.md).

- Sitio: https://hertzo.site

## Escenarios

Cada simulación tiene su propia dirección. La raíz (`hertzo.site/`) es la página principal: qué hace Hertzo y la entrada a los escenarios. El selector los agrupa en "Redes de datos" (celular, WiFi y LoRaWAN) y "Radio" (terreno, enlaces, radiodifusión y túneles).

| Dirección | Escenario | Entorno | Qué calcula |
| --- | --- | --- | --- |
| `/escenarios` | Selector "¿Qué quieres simular?" | — | Enlaces a cada escenario y sus variantes |
| `/celular` | Celular LTE / 5G (700 a 3500 MHz) | Mapa con relieve | RSRP, mejor sector, SINR con seis sitios vecinos, subida del teléfono a la torre y desbalance; teléfono en la calle o dentro de un edificio (Hata, 3GPP 38.901 o ITM) |
| `/interiores` | Interiores WiFi (2,4, 5 y 6 GHz) | Editor de planos | Mapa de calor de bajada y subida con muros de distintos materiales, muebles y varios access points |
| `/lora` | LoRaWAN (AU915, US915, EU868) | Mapa con relieve | Bajada, subida, SF de cada punto, tiempo en el aire, medidores concretos y mensajes que chocan en el aire (ITM de NTIA) |
| `/terreno` | Radiocomunicaciones en terreno: P25, trunking y convencional (VHF, UHF, 700, 800 MHz) | Mapa con relieve | Bajada, subida y desbalance de un sitio, radios concretos y llamadas que esperan canal (ITM de NTIA) |
| `/enlace` | Enlaces punto a punto | Mapa y perfil | Zona de Fresnel, difracción, nivel recibido, margen y disponibilidad con lluvia y multitrayecto |
| `/radiodifusion` | Radiodifusión FM y AM | Mapa con relieve | Campo en dBµV/m y zonas de servicio; AM diurna con onda de tierra sobre la Tierra esférica |
| `/cavernas` | Cavernas, túneles y minas | Editor de galerías | Bajada y subida por la red de galerías, curvas y cable radiante |

Las variantes van como parámetros: `/terreno?banda=uhf`, `/lora?banda=au915`, `/celular?banda=3500`, `/radiodifusion?servicio=am`, `/interiores?plano=oficina`, `/cavernas?escenario=mina`. Algunos ajustes también quedan en la dirección para compartirlos: `?confiabilidad=95`, `?entorno=urbano&altura-entorno=6`.

### Lo que comparten las páginas con mapa

- **Bajada y subida por separado.** Cada dirección tiene su frecuencia, su potencia y sus pérdidas; el mapa de desbalance muestra dónde llega solo una.
- **Confiabilidad.** Terreno y LoRa calculan por omisión con 90 % (como se diseña la radio profesional); se puede elegir 50 % (la mediana) o 95 %. FM y celular parten de 50 %.
- **Entorno del equipo.** El relieve no trae edificios: el menú "Entorno del equipo" suma la pérdida por estar entre construcciones o árboles (UIT-R P.2108), con la altura de lo que lo rodea editable. En Terreno y LoRa hay que elegirlo antes de simular, porque ningún valor sirve en todas partes: solo con el relieve el cálculo dio 19 dB de más contra mediciones de la UIT en zonas pobladas, y con casas o árboles quedaría corto en montaña despejada. Queda en la dirección: `?entorno=ninguno`, `?entorno=urbano`.
- **Equipos concretos** (Terreno y LoRa). Se agregan con clic en el mapa o pegando una lista de Excel; cada uno se calcula con el ITM punto a punto a su propia altura, se arrastra para moverlo y se le cambia el nombre o el tipo en su fila.
- **Capacidad.** Terreno estima cuántas llamadas esperan canal en la hora pico (Erlang C); LoRa, qué parte de los mensajes choca en el aire (ALOHA).
- **Exportar.** KMZ para Google Earth con cada capa y su leyenda, el sitio con su ficha y los equipos; CSV con los equipos. Interiores y Cavernas guardan y abren proyectos (.json).
- **Compartir** (Terreno, LoRa, Celular, Enlace y Radiodifusión). El botón copia un enlace con todo lo que tienes en la página: el sitio, el gateway, la torre, el transmisor o los extremos A y B, la emisora, las cadenas, el radio o el sensor, los sectores, los umbrales, la capacidad y los equipos. En un correo se pega como "Hertzo · Terreno 800 MHz · Cerro El Volador"; en el celular abre el menú de compartir del teléfono. Los datos van comprimidos después del `#` de la dirección, que no sale del navegador: Hertzo no los guarda ni los ve. Quien abre el enlace recibe una copia, y lo que cambie queda solo en su navegador. Un sitio con 20 radios cabe en unos 420 caracteres, y un gateway con 20 medidores de dos tipos en unos 500.

## Desarrollo

Requiere Node.js 22.12 o superior (lo exige Vitest).

```bash
npm install
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm test` | Pruebas unitarias (Vitest), con valores calculados a mano |
| `npm run build` | Compila el sitio estático en `dist/` |
| `npm run preview` | Sirve `dist/` para probar la compilación |
| `npm run build:wasm` | Recompila el motor ITM (C++ → WebAssembly). Solo si cambia el C++; ver [engine/README.md](engine/README.md) |
| `npm run indexnow` | Le avisa a Bing que el sitio cambió. Lo hace solo `.github/workflows/indexnow.yml` después de cada publicación; a mano solo hace falta para repetir el aviso |

## Publicar

El sitio se publica en Vercel desde la rama `main`; la rama de desarrollo es `alejoBranch` y sus cambios llegan a `main` al fusionarla. `npm run build` genera archivos estáticos en `dist/`:

- `dist/index.html`: la página principal del sitio (su fuente es `index.html` y `src/landing.ts`).
- `dist/<dirección>/index.html`: una copia de la app por cada dirección (`terreno`, `lora`, `interiores`…), cada una con su propio texto, más `dist/404.html`. La fuente de la app es `simulador.html`.

Así cualquier hosting estático sirve `hertzo.site/interiores` sin reglas de reescritura ni claves. En Vercel, `vercel.json` quita las variantes repetidas (`/lora/` e `/index.html`). El sitio debe ir en la raíz del dominio: las rutas de los archivos son absolutas (`/assets/…`).

### Buscadores y asistentes de IA

Lo que leen Google, Bing, ChatGPT, Claude o Perplexity sale de [src/seo/seo.ts](src/seo/seo.ts) y [src/seo/pageContent.ts](src/seo/pageContent.ts) al compilar:

- Cada página lleva su título, descripción, dirección oficial (`/terreno?banda=uhf` cuenta como `/terreno`), vista previa al compartir (`public/og.png`) y datos estructurados de schema.org: la aplicación, sus preguntas frecuentes (FAQPage) y la ruta de navegación.
- Cada simulación trae en su HTML su propio título principal, dos párrafos con su modelo y un ejemplo con números, y sus preguntas frecuentes; en la app quedan al final del panel en "Acerca de esta simulación".
- `dist/robots.txt` deja leer todo el sitio y nombra a los bots de IA; `dist/sitemap.xml` trae las 9 páginas; `dist/llms.txt` resume el sitio y cada simulación para asistentes de IA ([llmstxt.org](https://llmstxt.org)).
- La lista de escenarios de la página principal ya va escrita en `dist/index.html`, para quien no ejecuta JavaScript.

Al cambiar lo que dice una página, se actualiza su texto en `src/seo/pageContent.ts` y su fecha en `UPDATED` de `src/seo/seo.ts`. Si cambia el texto de la portada, `node docs/marca/generar-imagen-compartir.mjs` vuelve a dibujar `public/og.png`.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/rf/` | Física pura: unidades, balance de enlace, campo, onda de tierra, celular, Fresnel, lluvia, LoRa, entorno (P.2108), capacidad (Erlang y ALOHA), interiores y túneles |
| `src/geo/` | Geodesia: distancias, rumbos, puntos de destino |
| `src/terrain/` | Teselas de terreno, caché y perfiles |
| `src/propagation/` | Interfaz común de motores (`PropagationEngine`): ITM, ITM con entorno, onda de tierra, Hata y 3GPP |
| `src/coverage/` | Radiales, hilos de cálculo, recálculo e imagen de cobertura |
| `src/devices/` | Equipos concretos: lista pegada, pérdida punto a punto y estado de cada uno |
| `src/indoor/` | Plano de interiores, mapa de calor de bajada y subida, planos de ejemplo y proyectos |
| `src/cave/` | Red de galerías, propagación guiada, escenarios de ejemplo y proyectos |
| `src/editor/` | Vista de plano 2D compartida por los editores |
| `src/export/` | KMZ para Google Earth, leyendas, nombres de archivo, proyectos y enlaces de "Compartir" |
| `src/pages/` | Portada, rutas y una carpeta por escenario |
| `src/seo/` | Títulos, descripciones, texto de cada página, datos estructurados, robots.txt, sitemap.xml y llms.txt |
| `src/map/` | Mapa, marcadores y capas |
| `src/ui/` | Formularios, panel de balance, leyenda, lecturas, equipos, capacidad, entorno y confiabilidad |
| `engine/` | Código C++ del motor y script de compilación a WebAssembly |
| `scripts/` | Aviso a Bing (IndexNow) |

## Aviso

Hertzo es una herramienta de planificación. Sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados, en especial para sistemas de misión crítica.

## Créditos

Modelo ITM de NTIA (dominio público), mapa © colaboradores de OpenStreetMap, terreno de AWS Terrain Tiles (SRTM y GMTED2010 de USGS, entre otras fuentes) y MapLibre GL JS. Las fórmulas siguen recomendaciones de la UIT, 3GPP y NTIA, y los valores por omisión, hojas técnicas de fabricantes. Lista completa en [THIRD_PARTY.md](THIRD_PARTY.md) y en "Créditos y licencias" dentro de la app.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Montoya
