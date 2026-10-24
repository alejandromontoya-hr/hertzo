# Hertzo

Simulador web de propagación RF, gratuito y open source, pensado primero para radio profesional y ampliado a radiodifusión, celular, enlaces, interiores y cavernas.

Al entrar eliges qué quieres simular y se abre una página especializada: no se simula igual una repetidora en la montaña que un WiFi en una casa o una radio dentro de una mina. Cada página trae su modelo de propagación y su entorno.

Todo corre en tu navegador: sin servidores, sin cuentas y sin costo.

**Estado:** radio profesional en terreno funcional y en validación con sitios reales; las demás páginas son primeras versiones funcionales. Detalle en [docs/ESCENARIOS.md](docs/ESCENARIOS.md).

- Sitio: https://hertzo.site (próximamente)

## Escenarios

| Escenario | Entorno | Qué calcula |
| --- | --- | --- |
| Radiocomunicaciones en terreno (VHF, UHF, 700, 800 MHz) | Mapa con relieve | Bajada, subida y desbalance de un sitio, con su balance de enlace (ITM de NTIA) |
| Radiodifusión FM y AM | Mapa con relieve | Campo en dBµV/m y zonas de servicio; AM con onda de tierra según el suelo |
| Celular LTE / 5G | Mapa con relieve | RSRP, mejor sector y SINR de un sitio con sectores (Hata, 3GPP 38.901 o ITM) |
| Enlaces punto a punto | Mapa y perfil | Zona de Fresnel, difracción, nivel recibido, margen y disponibilidad |
| Interiores WiFi (2,4, 5, 6 GHz) | Editor de planos | Mapa de calor con muros de distintos materiales y varios access points |
| Cavernas, túneles y minas | Editor de galerías | Señal por la red de galerías, curvas y cable radiante |

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

## Publicar

`npm run build` genera archivos estáticos en `dist/` que funcionan en cualquier hosting estático (Cloudflare Pages, GitHub Pages), en la raíz del dominio o en una subcarpeta. No necesita servidor propio ni claves.

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
| `src/map/` | Mapa, marcadores y capas |
| `src/ui/` | Formularios, panel de balance, leyenda y lecturas |
| `engine/` | Código C++ del motor y script de compilación a WebAssembly |

## Aviso

Hertzo es una herramienta de planificación. Sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados, en especial para sistemas de misión crítica.

## Créditos

Modelo ITM de NTIA (dominio público), mapa © colaboradores de OpenStreetMap, terreno de AWS Terrain Tiles (SRTM y GMTED2010 de USGS, entre otras fuentes) y MapLibre GL JS. Lista completa en [THIRD_PARTY.md](THIRD_PARTY.md) y en «Créditos y licencias» dentro de la app.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Montoya
