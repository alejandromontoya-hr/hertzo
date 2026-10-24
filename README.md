# Hertzo

Simulador web de propagación RF, gratuito y open source, pensado para radio profesional: P25, trunking, convencional y punto a punto.

Haz clic en un punto del mapa, configura frecuencia, potencia y antena, y mira hasta dónde llega la señal. Hertzo calcula por separado la bajada (repetidora → radio) y la subida (radio → repetidora), porque oír la repetidora no garantiza que ella te oiga.

Todo corre en tu navegador: sin servidores, sin cuentas y sin costo.

**Estado:** prototipo de un sitio terminado, en validación con sitios reales.

- Sitio: https://hertzo.site (próximamente)

## Qué hace hoy

- Mapa con relieve, centrado en Antioquia. Un clic ubica el sitio; el marcador se puede arrastrar.
- Cadena de transmisión (bajada) y de recepción (subida) del sitio, y perfiles de radio: portátil en la cintura, portátil a la altura de la cara, móvil con antena en el techo y personalizado.
- Balance de enlace de cada dirección: ERP, PIRE, pérdidas, ganancias y pérdida de trayecto máxima.
- Cobertura con el modelo ITM (Longley-Rice) de NTIA sobre terreno SRTM, en un radio de hasta 100 km. Un sitio de 50 km tarda entre 4 y 10 segundos.
- Tres mapas: nivel de bajada, nivel de subida y desbalance (dónde llega cada dirección), con umbrales y opacidad ajustables.
- Al pasar el cursor: nivel y margen de bajada y subida, y distancia al sitio.
- Perfil del terreno entre el sitio y cualquier punto.

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
| `src/rf/` | Física pura: conversiones de unidades y balance de enlace |
| `src/geo/` | Geodesia: distancias, rumbos, puntos de destino |
| `src/terrain/` | Teselas de terreno, caché y perfiles |
| `src/propagation/` | Interfaz común de motores (`PropagationEngine`) y motor ITM |
| `src/coverage/` | Radiales, hilos de cálculo, recálculo e imagen de cobertura |
| `src/map/` | Mapa, marcadores y capas |
| `src/ui/` | Formularios, panel de balance, leyenda y lecturas |
| `engine/` | Código C++ del motor y script de compilación a WebAssembly |

## Aviso

Hertzo es una herramienta de planificación. Sus predicciones no reemplazan mediciones de campo ni estudios de ingeniería certificados, en especial para sistemas de misión crítica.

## Créditos

Modelo ITM de NTIA (dominio público), mapa © colaboradores de OpenStreetMap, terreno de AWS Terrain Tiles (SRTM y GMTED2010 de USGS, entre otras fuentes) y MapLibre GL JS. Lista completa en [THIRD_PARTY.md](THIRD_PARTY.md) y en «Créditos y licencias» dentro de la app.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Montoya
