// «node tools/capturas.mjs <nombre>»: abre Retenia (prueba) sin instalar (la carpeta
// release/prueba/win-unpacked que arma «npm run construir»), con una carpeta de datos temporal, y
// saca capturas de las pantallas en claro y en oscuro en docs/pruebas-manuales/capturas.
// Sirven para que una persona (y quien revisa) mire cómo se ve antes de aprobar; no se comparan
// con nada: la red no usa capturas de píxeles.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import { ROOT } from './lib/proceso.mjs';

const name = process.argv[2] ?? 'fase-03';
const out = join(ROOT, 'docs', 'pruebas-manuales', 'capturas');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'retenia-capturas-'));

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') {
    env[key] = value;
  }
}
env.RETENIA_DATOS = dataDir;

const app = await electron.launch({
  executablePath: join(ROOT, 'release', 'prueba', 'win-unpacked', 'Retenia (prueba).exe'),
  args: [],
  env,
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { level: 2, name: 'Tarjetas' }).waitFor();

  /** @param {string} screen */
  const shoot = async (screen) => {
    for (const [theme, label] of [
      ['light', 'claro'],
      ['dark', 'oscuro'],
    ]) {
      await page.emulateMedia({ colorScheme: /** @type {'light' | 'dark'} */ (theme) });
      await page.screenshot({ path: join(out, `${name}-${screen}-${label}.png`) });
    }
  };

  await shoot('1-lista');

  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('Roma');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Escribí la pregunta').waitFor();
  await shoot('2-formulario-con-aviso');

  await page.getByRole('textbox', { name: 'Pregunta' }).fill('¿Capital de Francia?');
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('París');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Tarjeta guardada').waitFor();
  await shoot('3-lista-con-cartel');

  await page
    .getByRole('listitem')
    .filter({ hasText: '¿Capital de Francia?' })
    .getByRole('button', { name: 'Repasar' })
    .click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).waitFor();
  await shoot('4-repaso-pregunta');

  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La sabía', exact: true }).waitFor();
  await shoot('5-repaso-respuesta');

  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  await page.getByText('Próximo repaso: miércoles 17/03/2027').waitFor();
  await shoot('6-repaso-resultado');

  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await page.getByRole('listitem').first().waitFor();
  await shoot('7-lista-con-repaso');
  console.log(`Capturas guardadas en docs/pruebas-manuales/capturas (prefijo ${name}-).`);
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
