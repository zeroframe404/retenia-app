import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Capas de la red (docs/plan-de-pruebas.md, sección 1). Las rápidas corren en
// «verificar»; «red» (los sabotajes y las pruebas que corren la red entera)
// solo en «verificar:todo».
export default defineConfig({
  // Cada corrida aislada de la red (RETENIA_RUN_DIR) usa su propia caché, para que varias
  // corridas en paralelo no se pisen.
  cacheDir: process.env.RETENIA_RUN_DIR ? join(process.env.RETENIA_RUN_DIR, 'vite') : '.cache/vite',
  test: {
    allowOnly: false,
    passWithNoTests: false,
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unitarias', include: ['tests/unitarias/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'propiedades', include: ['tests/propiedades/**/*.test.ts'] },
      },
      { extends: true, test: { name: 'contrato', include: ['tests/contrato/**/*.test.ts'] } },
      {
        // Las pantallas de la ventana (capa R): Testing Library con jsdom.
        extends: true,
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'componentes',
          include: ['tests/componentes/**/*.test.tsx'],
          environment: 'jsdom',
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['tests/integracion/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'estaticas',
          include: ['tests/estaticas/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        // El programa empaquetado de cada variante, tal como lo deja «npm run construir»
        // (CA-013, fuses). Solo en «verificar:todo».
        extends: true,
        test: {
          name: 'paquete',
          include: ['tests/paquete/**/*.test.ts'],
          testTimeout: 120_000,
          maxWorkers: 3,
        },
      },
      {
        extends: true,
        test: {
          name: 'red',
          include: ['tests/red/**/*.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
          maxWorkers: 3,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      reporter: ['json-summary'],
    },
  },
});
