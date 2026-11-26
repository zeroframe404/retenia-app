import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';
import {
  aiSection,
  check,
  connectKey,
  explain,
  explanationPanel,
  openMaterial,
  PARAMETER,
  SAMPLE,
  SLOW,
  SURVEYS,
  TRAP,
  toSettings,
  withFakeAi,
} from './pasos-ia';

// Accesibilidad de las pantallas nuevas de la Fase 19 con axe-core, en claro y en oscuro: Ajustes ›
// «Inteligencia artificial» (sin clave, con la conexión probada, con gasto y con el tope), el panel
// «Explicación» en cada estado, el permiso del material, los interruptores de «Demostración» y el
// aviso de la explicación que llegó. Con la IA simulada y con el servidor de la IA en la PC (simulado).

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

async function violationsNow(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  const found: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
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

test('accesibilidad: la IA simulada, el panel de la explicación y sus estados no tienen faltas según axe-core, en claro y en oscuro (simulado)', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toSettings(page);
  expect(await violationsNow(page), 'Ajustes sin clave').toEqual([]);

  await openMaterial(page, /Inferencia — capítulos 1 a 4/);
  await explain(page, SAMPLE);
  await expect(
    explanationPanel(page).getByText('Para usar esto hay que conectar la IA'),
  ).toBeVisible(SLOW);
  expect(await violationsNow(page), 'el panel sin IA').toEqual([]);

  await goToDestination(page, 'Ajustes');
  await check(page, 'IA simulada', true);
  expect(await violationsNow(page), 'los interruptores de la IA simulada').toEqual([]);

  await openMaterial(page, /trampa\.md/);
  await explain(page, TRAP);
  await expect(
    explanationPanel(page).getByRole('heading', { name: 'Según tu material' }),
  ).toBeVisible(SLOW);
  expect(await violationsNow(page), 'la explicación').toEqual([]);

  await goToDestination(page, 'Ajustes');
  await check(page, 'IA simulada: responder mal', true);
  await openMaterial(page, /trampa\.md/);
  await explain(page, SURVEYS);
  await expect(explanationPanel(page).getByText('No pude completar esto. Reintentá.')).toBeVisible(
    SLOW,
  );
  expect(await violationsNow(page), 'la respuesta descartada').toEqual([]);

  await goToDestination(page, 'Ajustes');
  await check(page, 'IA simulada: responder mal', false);
  await check(page, 'Simular sin conexión', true);
  await openMaterial(page, /trampa\.md/);
  await explain(page, SURVEYS);
  await expect(
    explanationPanel(page).getByText('Pendiente: se reanuda cuando haya conexión'),
  ).toBeVisible(SLOW);
  expect(await violationsNow(page), 'la explicación pendiente').toEqual([]);

  await goToDestination(page, 'Ajustes');
  await check(page, 'Simular sin conexión', false);
  await expect(page.getByText('Llegó la explicación que estaba pendiente.')).toBeVisible(SLOW);
  expect(await violationsNow(page), 'el aviso de la que llegó').toEqual([]);
});

test('accesibilidad: con tu clave, el permiso, el costo, «Qué se envió», el tope y el modo solo local no tienen faltas según axe-core, en claro y en oscuro (simulado)', async ({
  launchFromStart,
  dataDir,
}) => {
  const { fake, page } = await withFakeAi(launchFromStart, dataDir);
  try {
    await connectKey(page);
    expect(await violationsNow(page), 'la conexión correcta').toEqual([]);

    await openMaterial(page, /Inferencia — capítulos 1 a 4/);
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await explain(page, PARAMETER);
    const question = page.getByRole('dialog', {
      name: '¿Permitir enviar fragmentos de este material a la IA?',
    });
    await expect(question).toBeVisible(SLOW);
    expect(await violationsNow(page), 'el permiso').toEqual([]);
    await question.getByRole('button', { name: 'Siempre para este material' }).click();
    await expect(explanationPanel(page).getByText('Costo de esta consulta: USD 0,01')).toBeVisible(
      SLOW,
    );
    expect(await violationsNow(page), 'la explicación con su costo').toEqual([]);

    await toSettings(page);
    await expect(aiSection(page).getByText(/^15\/03\/2027 · Explicar un fragmento/)).toBeVisible();
    await aiSection(page).getByLabel('Tope mensual (USD)').fill('0,01');
    await aiSection(page).getByRole('button', { name: 'Guardar tope' }).click();
    await expect(aiSection(page).getByText('Llegaste al tope de este mes')).toBeVisible();
    expect(await violationsNow(page), '«Qué se envió», el permiso guardado y el tope').toEqual([]);

    await check(page, 'Modo solo local', true);
    await openMaterial(page, /Inferencia — capítulos 1 a 4/);
    await explain(page, SAMPLE);
    await expect(
      explanationPanel(page).getByText(
        'El modo solo local está activado: no se envía nada a la IA.',
      ),
    ).toBeVisible(SLOW);
    expect(await violationsNow(page), 'el modo solo local').toEqual([]);
  } finally {
    await fake.close();
  }
});
