import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// El humo del instalador (tests/instalado). Corre en el CI, en una Windows limpia, con el
// instalador que arma el mismo trabajo (RETENIA_INSTALADOR). Un solo trabajador y en orden:
// cada paso usa lo que dejó el anterior.
const reports = resolve(process.env.RETENIA_RUN_DIR ?? '.cache/red/instalado', 'humo');

export default defineConfig({
  testDir: 'tests/instalado',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  outputDir: resolve(reports, 'resultados'),
  reporter: [
    ['json', { outputFile: resolve(reports, 'informe.json') }],
    ['html', { outputFolder: resolve(reports, 'informe-html'), open: 'never' }],
    ['line'],
  ],
});
