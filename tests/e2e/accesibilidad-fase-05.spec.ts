import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { DEV_MODELS_DIR } from '../../tools/lib/modelos.mjs';
import { expect, test } from './apoyo';
import { goTo } from './pasos';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

// Las faltas de accesibilidad que axe-core encuentra en lo que se ve ahora, en claro y en oscuro.
async function violationsNow(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    // Sin movimiento: los colores no están a medio cambiar cuando axe los mide (Fase 06).
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const violations = await page.evaluate(async () => {
      const axe = (globalThis as unknown as { axe: { run: AxeRun } }).axe;
      const outcome = await axe.run(document, { resultTypes: ['violations'] });
      return outcome.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
    });
    found.push(...violations.map((violation) => `tema ${theme}: ${violation}`));
  }
  return found;
}

test('accesibilidad: el Laboratorio, con la voz lista, el PDF leído y los pasos del micrófono abiertos, no tiene faltas según axe-core, en claro y en oscuro (simulado)', async ({
  launch,
}) => {
  const { page } = await launch(undefined, {
    RETENIA_MODELOS: DEV_MODELS_DIR,
    RETENIA_SIMULAR_MICROFONO: 'bloqueado',
  });
  await goTo(page, 'Ajustes');
  await page.evaluate(AXE);
  expect(await violationsNow(page), 'ajustes con «Laboratorio» y «Simular sin conexión»').toEqual(
    [],
  );
  await page.getByRole('button', { name: 'Laboratorio' }).click();
  await expect(page.getByText('Modelos listos')).toBeVisible();
  await page.evaluate(AXE);
  expect(await violationsNow(page), 'laboratorio recién abierto').toEqual([]);

  const pdf = page.getByRole('region', { name: 'PDF' });
  await pdf.getByRole('button', { name: 'Leer PDF de prueba' }).click();
  await expect(pdf.getByRole('figure', { name: 'Página 1 con la frase resaltada' })).toBeVisible({
    timeout: 30_000,
  });
  const transcription = page.getByRole('region', { name: 'Transcripción' });
  await transcription.getByRole('button', { name: 'Grabar' }).click();
  await transcription.getByRole('link', { name: 'Cómo habilitarlo' }).click();
  expect(await violationsNow(page), 'laboratorio con resultados').toEqual([]);
});
