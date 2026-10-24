import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas: el sitio funciona en cualquier carpeta de un hosting estático.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    // Mientras no existan pruebas (llegan con el módulo de física), `npm test` no debe fallar.
    passWithNoTests: true,
  },
});
