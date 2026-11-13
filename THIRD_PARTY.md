# Componentes y datos de terceros

Hertzo se publica bajo licencia MIT. Estos son los componentes y datos de terceros que usa, con su licencia y su compatibilidad con MIT.

## Bibliotecas incluidas en el sitio

| Componente | Versión | Licencia | Compatible con MIT | Uso |
| --- | --- | --- | --- | --- |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 6.x | BSD-3-Clause | Sí (exige conservar el aviso de copyright) | Mapa interactivo |
| [ITM de NTIA](https://github.com/NTIA/itm) (Longley-Rice) | v1.4, commit `183ad95` | Dominio público en EE. UU. (Título 15 U.S.C. §105); en otros países, permiso irrevocable y gratuito para usar, modificar y distribuir. Pide reconocer a NTIA y anotar cambios. Ver `engine/itm/LICENSE.md` | Sí | Motor de propagación (`engine/itm/`, sin modificar) |
| Runtime de [Emscripten](https://emscripten.org) | 6.0.13 | MIT / University of Illinois NCSA | Sí | Código que carga el motor WebAssembly (`src/propagation/wasm/itm.mjs`) |
| Fuentes [Geist y Geist Mono](https://github.com/vercel/geist-font) (Vercel), empaquetadas por [Fontsource](https://fontsource.org) (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) | 5.3.0 | SIL Open Font License 1.1 | Sí (la OFL permite incluir y distribuir la fuente con el sitio; no se puede vender sola) | Letras de toda la interfaz; el sitio las sirve desde sus propios archivos |
| [Vercel Web Analytics](https://vercel.com/docs/analytics) (`@vercel/analytics`) | 2.0.1 | MIT | Sí | Contador de visitas del sitio publicado en Vercel; sin cookies ni datos personales. No recibe lo que va después del `#` de la dirección, donde viajan los datos de "Compartir" |
| Íconos [Lucide](https://lucide.dev) (`lucide-static`) | 1.61.0 | ISC | Sí | Íconos de los escenarios (`signal`, `house-wifi`, `antenna`, `radio-tower`, `satellite-dish`, `boom-box`, `pickaxe`), de los botones (`download`, `map-pin`, `locate-fixed`) y de los equipos en el mapa y en los planos (`radio-tower` en el sitio, `car-front` en el radio móvil, `utility-pole` y `gauge` en los sensores LoRaWAN, `satellite-dish` en los extremos del enlace, `router` en los puntos de acceso WiFi y `antenna` en las antenas de Cavernas). El radio portátil (walkie-talkie) es un dibujo propio con la misma grilla y trazo de Lucide |
| Logos de GitHub y LinkedIn de [Simple Icons](https://simpleicons.org) | GitHub 16.35.0; LinkedIn 8.15.0, la última que lo traía | CC0 1.0 (dominio público) | Sí; los logos siguen siendo marcas de sus dueños y solo se usan para enlazar a esos sitios | Enlaces a GitHub y LinkedIn de la página principal (`src/ui/icons.ts`) |
| Fuente [Geist Mono](https://github.com/vercel/geist-font) (Vercel) | 1.3.1, peso Medium | SIL Open Font License 1.1 | Sí (la OFL permite usar la fuente en logos e imágenes; no se redistribuye el archivo de la fuente) | Letras "hertz" del logo, convertidas a trazos (`docs/marca/`, `public/logo.svg`) |

## Datos que se descargan en tiempo de ejecución

No se copian al repositorio; el navegador los pide y los guarda en caché.

| Datos | Fuente | Licencia / condiciones | Uso |
| --- | --- | --- | --- |
| Mapa base | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL; exige el crédito "colaboradores de OpenStreetMap" y respetar su [política de uso de teselas](https://operations.osmfoundation.org/policies/tiles/) | Fondo del mapa en las opciones Carta y Color |
| Mapa topográfico | [OpenTopoMap](https://opentopomap.org/about) | Estilo CC-BY-SA 3.0; datos de OpenStreetMap (ODbL) y SRTM. Exige su crédito, que el mapa muestra al elegir esta opción; sus servidores admiten solo tráfico bajo | Fondo del mapa en la opción Topográfico |
| Terreno | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), formato Terrarium | Datos abiertos; en Colombia la fuente es SRTM (cortesía de USGS). Créditos exigidos según la [lista de fuentes](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Relieve sombreado y cota del terreno |

## Normas y datos técnicos de referencia

No se copia código de ellos: Hertzo escribe sus propias fórmulas a partir de estos textos, con pruebas que usan valores calculados a mano.

| Fuente | Uso |
| --- | --- |
| [UIT-R P.525](https://www.itu.int/rec/R-REC-P.525), [P.526](https://www.itu.int/rec/R-REC-P.526) y [P.676](https://www.itu.int/rec/R-REC-P.676) | Espacio libre, difracción por aristas y gases en enlaces |
| [UIT-R P.530-18](https://www.itu.int/rec/R-REC-P.530) y [P.838-3](https://www.itu.int/rec/R-REC-P.838) | Lluvia y despeje de Fresnel en enlaces de microondas |
| [UIT-R P.368](https://www.itu.int/rec/R-REC-P.368) y casos de prueba del [LFMF de NTIA](https://github.com/NTIA/LFMF-test-data) | Onda de tierra AM y su validación |
| [UIT-R P.2108-1](https://www.itu.int/rec/R-REC-P.2108) | Entorno del equipo (edificios y árboles) |
| [UIT-R P.2040](https://www.itu.int/rec/R-REC-P.2040) y [BS.412](https://www.itu.int/rec/R-REC-BS.412) | Pérdida de materiales en interiores; zonas de servicio FM |
| Okumura-Hata, COST-231 y [3GPP TR 38.901](https://www.3gpp.org/dynareport/38901.htm) | Celular: pérdida de trayecto, patrón de antena y entrada a edificios |
| TIA TSB-88 | Sensibilidad con desvanecimiento y confiabilidad en radio profesional |
| Semtech SX1276 y AN1200.13; LoRa Alliance RP002-1.0.3 | Sensibilidad LoRa por SF, tiempo en el aire y planes AU915, US915 y EU868 |
| Emslie, Lagace y Strong (1975) y [tutorial de comunicaciones mineras de NIOSH](https://archive.cdc.gov/www_cdc_gov/niosh/mining/content/emergencymanagementandresponse/commtracking/advcommtrackingtutorial2.html) | Propagación en túneles y minas |
| Hojas técnicas: Motorola APX 8000 y GTR 8000, RFS RLKW12-50, CommScope LDF5-50A, Ericsson AIR 6449 | Valores por omisión de radios, repetidora, cable radiante, línea 7/8" y antena 5G |
| ANE: Resolución 105 de 2020 y Resolución 737 de 2022; Decreto 1445 de 1995 | Límites de potencia en 915–928 MHz y 6 GHz en Colombia; contornos AM |

## Revisados y descartados

| Componente | Licencia | Motivo |
| --- | --- | --- |
| [SPLAT!](https://www.qsl.net/kd2bd/splat.html) | GPL-2.0 | No compatible con MIT: obligaría a publicar Hertzo bajo GPL. Se usa el ITM de NTIA en su lugar. |
| [Signal-Server](https://github.com/Cloud-RF/Signal-Server) | GPL-2.0 | Mismo motivo que SPLAT!. |
| [Meshtastic Site Planner](https://github.com/meshtastic/meshtastic-site-planner) | GPL-3.0 | Mismo motivo; solo se tomó como referencia de producto, sin copiar código. |
