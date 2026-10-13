import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// Informes en la carpeta de la corrida (la elige tools/verify.mjs con RETENIA_RED_DIR).
const reports = resolve(process.env.RETENIA_RED_DIR ?? '.cache/red/manual', 'punta-a-punta');

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: true,
  fullyParallel: true,
  workers: 3,
  retries: 0,
  timeout: 60_000,
  outputDir: resolve(reports, 'resultados'),
  reporter: [
    ['json', { outputFile: resolve(reports, 'informe.json') }],
    ['html', { outputFolder: resolve(reports, 'informe-html'), open: 'never' }],
    ['line'],
  ],
});
