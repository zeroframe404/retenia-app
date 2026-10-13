import { defineConfig } from 'vitest/config';

// Capas de la red (docs/plan-de-pruebas.md, sección 1). Las rápidas corren en
// «verificar»; «red» (los sabotajes y las pruebas que corren la red entera)
// solo en «verificar:todo».
export default defineConfig({
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
        extends: true,
        test: {
          name: 'integracion',
          include: ['tests/integracion/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
      { extends: true, test: { name: 'estaticas', include: ['tests/estaticas/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'red',
          include: ['tests/red/**/*.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
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
