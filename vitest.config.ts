import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Capas de la red (docs/plan-de-pruebas.md, sección 1). Las rápidas corren en
// «verificar»; «corte», «paquete» y «red» (los sabotajes y las pruebas que corren la red
// entera) solo en «verificar:todo».
export default defineConfig({
  // Cada corrida aislada de la red (RETENIA_RUN_DIR) usa su propia caché, para que varias
  // corridas en paralelo no se pisen.
  cacheDir: process.env.RETENIA_RUN_DIR ? join(process.env.RETENIA_RUN_DIR, 'vite') : '.cache/vite',
  test: {
    allowOnly: false,
    passWithNoTests: false,
    environment: 'node',
    // Vitest usa por defecto un trabajador menos que los núcleos: en la máquina del CI (dos
    // núcleos) corría los archivos de a uno. Con dos como mínimo usa la máquina entera.
    maxWorkers: Math.max(2, availableParallelism() - 1),
    projects: [
      { extends: true, test: { name: 'unitarias', include: ['tests/unitarias/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'propiedades', include: ['tests/propiedades/**/*.test.ts'] },
      },
      {
        // Abren una base real y hacen copias y restauraciones: dentro de un sabotaje, con tres
        // redes a la vez en la máquina del CI, pasaban los 5 s que Vitest da por defecto.
        extends: true,
        test: {
          name: 'contrato',
          include: ['tests/contrato/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
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
        // Las piezas del Laboratorio que tienen que andar sin internet (voz, transcripción, PDF
        // y escaneos): cada proceso de pruebas arranca con la red bloqueada, y Node repite el
        // bloqueo en cada hilo que abra (tests/apoyo/sin-red.cjs). Solo en «verificar:todo»: con
        // los modelos reales, dejaban a la red rápida fuera de su tope en la máquina del CI.
        extends: true,
        test: {
          name: 'sin-red',
          include: ['tests/sin-red/**/*.test.ts'],
          execArgv: ['--require', join(import.meta.dirname, 'tests', 'apoyo', 'sin-red.cjs')],
          testTimeout: 120_000,
          hookTimeout: 120_000,
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
        // El corte a la fuerza (CA-017): cientos de procesos que se matan en cada punto de cada
        // escritura. Solo en «verificar:todo»: en la máquina del CI, dentro de «verificar»,
        // dejaba a la red rápida fuera de su tope de 2 minutos.
        extends: true,
        test: {
          name: 'corte',
          include: ['tests/corte/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
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
        // CA-001 mide cuánto tarda «verificar»: corre solo, antes de los sabotajes, para que la
        // medición no compita por el procesador con las otras redes que ellos corren.
        extends: true,
        test: {
          name: 'tiempo',
          include: ['tests/red/verificar.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'red',
          include: ['tests/red/**/*.test.ts'],
          exclude: ['tests/red/verificar.test.ts'],
          testTimeout: 1_500_000,
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
