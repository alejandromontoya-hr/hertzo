// Compila el motor ITM a WebAssembly con Emscripten: `npm run build:wasm`.
//
// Requiere Emscripten instalado (https://emscripten.org). Busca `em++` (compilador C++ de
// Emscripten) en la carpeta indicada por la variable EMSDK, en ~/emsdk o en el PATH.
// El resultado (src/propagation/wasm/itm.mjs) se sube al repositorio, así `npm run build`
// funciona sin Emscripten. Solo hay que recompilar si cambia el C++.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

function findCompiler() {
  const names = isWindows ? ['em++.exe', 'em++.bat'] : ['em++'];
  const candidates = [process.env.EMSDK, join(homedir(), 'emsdk')].filter(Boolean);
  for (const emsdk of candidates) {
    for (const name of names) {
      const emcc = join(emsdk, 'upstream', 'emscripten', name);
      if (existsSync(emcc)) return emcc;
    }
  }
  return 'em++';
}

const itmSources = readdirSync(join(root, 'engine/itm/src'))
  .filter((f) => f.endsWith('.cpp'))
  .map((f) => `engine/itm/src/${f}`);

const outDir = join(root, 'src/propagation/wasm');
mkdirSync(outDir, { recursive: true });

const args = [
  'engine/hertzo_itm.cpp',
  ...itmSources,
  '-I', 'engine/itm/include',
  '-include', 'engine/compat.h',
  '-O3',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createItmModule',
  '-sENVIRONMENT=web,worker,node',
  // El .wasm va incrustado en el .mjs: un solo archivo que cargan igual el navegador,
  // los hilos de cálculo y las pruebas en Node.
  '-sSINGLE_FILE=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sEXPORTED_FUNCTIONS=_hertzo_itm_p2p,_hertzo_itm_radial,_malloc,_free',
  '-sEXPORTED_RUNTIME_METHODS=HEAPF64,HEAPF32,HEAP32',
  '-o', 'src/propagation/wasm/itm.mjs',
];

const emcc = findCompiler();
console.log(`Compilando con ${emcc}…`);
// Los .bat de Windows solo se pueden lanzar a través de la consola.
const result = spawnSync(emcc, args, { cwd: root, stdio: 'inherit', shell: emcc.endsWith('.bat') });
if (result.status !== 0) {
  console.error('\nLa compilación falló. Revisa el error de arriba; para instalar Emscripten ver engine/README.md.');
  process.exit(result.status ?? 1);
}
console.log('Listo: src/propagation/wasm/itm.mjs');
