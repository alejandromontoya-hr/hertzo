# Motor de propagación (C++ → WebAssembly)

- `itm/`: Irregular Terrain Model (Longley-Rice) de NTIA, sin modificar. Fuente: https://github.com/NTIA/itm, commit en `itm/NTIA_COMMIT`. Dominio público en EE. UU.; ver `itm/LICENSE.md` y `THIRD_PARTY.md`.
- `itm/test-data/`: casos de prueba oficiales de NTIA, usados por `src/propagation/itm.test.ts`.
- `hertzo_itm.cpp`: puente con dos funciones, punto a punto y radial.
- `compat.h`: anula `__declspec`, que solo existe en Windows, para no tocar el código de NTIA.
- `build.mjs`: compila todo a `src/propagation/wasm/itm.mjs`.

## Recompilar

Solo hace falta si cambia el C++. El `.mjs` compilado está en el repositorio, así que `npm run build` no necesita Emscripten.

1. Instala Emscripten (una vez, ~1 GB):
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
   cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
   ```
   En Windows usa `emsdk.bat` en lugar de `./emsdk`.
2. Desde la raíz del proyecto:
   ```bash
   npm run build:wasm
   npm test
   ```
