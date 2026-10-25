# Componentes y datos de terceros

Hertzo se publica bajo licencia MIT. Estos son los componentes y datos de terceros que usa, con su licencia y su compatibilidad con MIT.

## Bibliotecas incluidas en el sitio

| Componente | Versión | Licencia | Compatible con MIT | Uso |
| --- | --- | --- | --- | --- |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 6.x | BSD-3-Clause | Sí (exige conservar el aviso de copyright) | Mapa interactivo |
| [ITM de NTIA](https://github.com/NTIA/itm) (Longley-Rice) | v1.4, commit `183ad95` | Dominio público en EE. UU. (Título 15 U.S.C. §105); en otros países, permiso irrevocable y gratuito para usar, modificar y distribuir. Pide reconocer a NTIA y anotar cambios. Ver `engine/itm/LICENSE.md` | Sí | Motor de propagación (`engine/itm/`, sin modificar) |
| Runtime de [Emscripten](https://emscripten.org) | 6.0.13 | MIT / University of Illinois NCSA | Sí | Código que carga el motor WebAssembly (`src/propagation/wasm/itm.mjs`) |
| Fuentes [Geist y Geist Mono](https://github.com/vercel/geist-font) (Vercel), empaquetadas por [Fontsource](https://fontsource.org) (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) | 5.3.0 | SIL Open Font License 1.1 | Sí (la OFL permite incluir y distribuir la fuente con el sitio; no se puede vender sola) | Letras de toda la interfaz; el sitio las sirve desde sus propios archivos |
| Íconos [Lucide](https://lucide.dev) (`lucide-static`) | 1.61.0 | ISC | Sí | Íconos de los escenarios (`radio-tower`, `boom-box`, `signal`, `satellite-dish`, `house-wifi`, `pickaxe`) |
| Logos de GitHub y LinkedIn de [Simple Icons](https://simpleicons.org) | GitHub 16.35.0; LinkedIn 8.15.0, la última que lo traía | CC0 1.0 (dominio público) | Sí; los logos siguen siendo marcas de sus dueños y solo se usan para enlazar a esos sitios | Enlaces a GitHub y LinkedIn de la página principal (`src/ui/icons.ts`) |
| Fuente [Geist Mono](https://github.com/vercel/geist-font) (Vercel) | 1.3.1, peso Medium | SIL Open Font License 1.1 | Sí (la OFL permite usar la fuente en logos e imágenes; no se redistribuye el archivo de la fuente) | Letras «hertz» del logo, convertidas a trazos (`docs/marca/`, `public/logo.svg`) |

## Datos que se descargan en tiempo de ejecución

No se copian al repositorio; el navegador los pide y los guarda en caché.

| Datos | Fuente | Licencia / condiciones | Uso |
| --- | --- | --- | --- |
| Mapa base | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL; exige el crédito «colaboradores de OpenStreetMap» y respetar su [política de uso de teselas](https://operations.osmfoundation.org/policies/tiles/) | Fondo del mapa en las opciones Carta y Color |
| Mapa topográfico | [OpenTopoMap](https://opentopomap.org/about) | Estilo CC-BY-SA 3.0; datos de OpenStreetMap (ODbL) y SRTM. Exige su crédito, que el mapa muestra al elegir esta opción; sus servidores admiten solo tráfico bajo | Fondo del mapa en la opción Topográfico |
| Terreno | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), formato Terrarium | Datos abiertos; en Colombia la fuente es SRTM (cortesía de USGS). Créditos exigidos según la [lista de fuentes](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Relieve sombreado y cota del terreno |

## Revisados y descartados

| Componente | Licencia | Motivo |
| --- | --- | --- |
| [SPLAT!](https://www.qsl.net/kd2bd/splat.html) | GPL-2.0 | No compatible con MIT: obligaría a publicar Hertzo bajo GPL. Se usa el ITM de NTIA en su lugar. |
| [Signal-Server](https://github.com/Cloud-RF/Signal-Server) | GPL-2.0 | Mismo motivo que SPLAT!. |
| [Meshtastic Site Planner](https://github.com/meshtastic/meshtastic-site-planner) | GPL-3.0 | Mismo motivo; solo se tomó como referencia de producto, sin copiar código. |
