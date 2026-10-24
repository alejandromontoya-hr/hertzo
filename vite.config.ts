import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas: el sitio funciona en cualquier carpeta de un hosting estático.
  base: './',
  build: {
    // MapLibre por sí solo pesa ~1 MB; el aviso por defecto (500 kB) saltaría siempre.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
