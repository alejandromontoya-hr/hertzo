# Componentes y datos de terceros

Hertzo se publica bajo licencia MIT. Estos son los componentes y datos de terceros que usa, con su licencia y su compatibilidad con MIT.

## Bibliotecas incluidas en el sitio

| Componente | Versión | Licencia | Compatible con MIT | Uso |
| --- | --- | --- | --- | --- |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 6.x | BSD-3-Clause | Sí (exige conservar el aviso de copyright) | Mapa interactivo |
| [ITM de NTIA](https://github.com/NTIA/itm) (Longley-Rice) | v1.4, commit `183ad95` | Dominio público en EE. UU. (Título 15 U.S.C. §105); en otros países, permiso irrevocable y gratuito para usar, modificar y distribuir. Pide reconocer a NTIA y anotar cambios. Ver `engine/itm/LICENSE.md` | Sí | Motor de propagación (`engine/itm/`, sin modificar) |
| Runtime de [Emscripten](https://emscripten.org) | 6.0.13 | MIT / University of Illinois NCSA | Sí | Código que carga el motor WebAssembly (`src/propagation/wasm/itm.mjs`) |

## Datos que se descargan en tiempo de ejecución

No se copian al repositorio; el navegador los pide y los guarda en caché.

| Datos | Fuente | Licencia / condiciones | Uso |
| --- | --- | --- | --- |
| Mapa base | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL; exige el crédito «colaboradores de OpenStreetMap» y respetar su [política de uso de teselas](https://operations.osmfoundation.org/policies/tiles/) | Fondo del mapa |
| Terreno | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), formato Terrarium | Datos abiertos; en Colombia la fuente es SRTM (cortesía de USGS). Créditos exigidos según la [lista de fuentes](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Relieve sombreado y cota del terreno |

## Revisados y descartados

| Componente | Licencia | Motivo |
| --- | --- | --- |
| [SPLAT!](https://www.qsl.net/kd2bd/splat.html) | GPL-2.0 | No compatible con MIT: obligaría a publicar Hertzo bajo GPL. Se usa el ITM de NTIA en su lugar. |
| [Signal-Server](https://github.com/Cloud-RF/Signal-Server) | GPL-2.0 | Mismo motivo que SPLAT!. |
| [Meshtastic Site Planner](https://github.com/meshtastic/meshtastic-site-planner) | GPL-3.0 | Mismo motivo; solo se tomó como referencia de producto, sin copiar código. |
