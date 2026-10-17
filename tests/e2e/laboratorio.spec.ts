import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { DEV_MODELS_DIR } from '../../tools/lib/modelos.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { serveModels } from '../apoyo/servidor-de-modelos';
import { expect, test } from './apoyo';
import { goTo } from './pasos';

// Punta a punta de H-07 sobre Retenia (prueba) empaquetada: cada botón del Laboratorio muestra
// su resultado con las piezas de verdad (sherpa-onnx con Kokoro y Whisper en el proceso de voz,
// pdf.js y tesseract.js en el de materiales, el aviso de Windows). Los modelos ya bajados de
// desarrollo se usan tal cual (RETENIA_MODELOS); la descarga se prueba contra un servidor local
// que los sirve como la página real (RETENIA_MODELOS_ORIGEN). El micrófono de prueba es el de
// Chromium con el audio de ejemplo «good morning» (RETENIA_MICROFONO_ARCHIVO), y el micrófono
// bloqueado se simula (RETENIA_SIMULAR_MICROFONO): fronteras de voz declaradas.

const MISSING =
  'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.';
const WITH_MODELS = { RETENIA_MODELOS: DEV_MODELS_DIR };

async function openLab(page: Page) {
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Laboratorio' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Laboratorio' })).toBeVisible();
}

const block = (page: Page, name: string) => page.getByRole('region', { name });

test('[CA-024] «Descargar modelos» baja los modelos con una barra que avanza, verifica cada huella y termina en «Modelos listos» (simulado)', async ({
  launch,
}, testInfo) => {
  // Bajar, verificar y guardar 506 MB lleva su tiempo, sobre todo en el CI.
  test.setTimeout(300_000);
  const server = await serveModels(DEV_MODELS_DIR);
  try {
    const { page } = await launch(undefined, {
      RETENIA_MODELOS: testInfo.outputPath('modelos'),
      RETENIA_MODELOS_ORIGEN: server.origin,
    });
    await openLab(page);
    const voice = block(page, 'Voz');
    await expect(voice.getByText(MISSING)).toBeVisible();
    await voice.getByRole('button', { name: 'Descargar modelos' }).click();
    await expect(voice.getByRole('progressbar', { name: 'Descarga de los modelos' })).toBeVisible();
    await expect(voice.getByText(/^Bajando los modelos: \d+ %$/)).toBeVisible();
    await expect(voice.getByText('Modelos listos')).toBeVisible({ timeout: 180_000 });
    await expect(voice.getByRole('progressbar')).toHaveCount(0);
    expect(server.requests.length).toBeGreaterThan(10);

    // Con lo que bajó, ya habla.
    await voice.getByRole('textbox', { name: 'Frase en inglés' }).fill('Good morning');
    await voice.getByRole('button', { name: 'Decir en voz alta' }).click();
    await expect(voice.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible({ timeout: 120_000 });
  } finally {
    await server.close();
  }
});

test('[CA-024] sin modelos y con «Simular sin conexión», «Descargar modelos» pide conectarse y no baja nada (simulado)', async ({
  launch,
}, testInfo) => {
  const server = await serveModels(DEV_MODELS_DIR);
  try {
    const { page } = await launch(undefined, {
      RETENIA_MODELOS: testInfo.outputPath('modelos'),
      RETENIA_MODELOS_ORIGEN: server.origin,
    });
    await goTo(page, 'Ajustes');
    await page.getByRole('checkbox', { name: 'Simular sin conexión' }).check();
    await page.getByRole('button', { name: 'Laboratorio' }).click();
    const voice = block(page, 'Voz');
    await voice.getByRole('button', { name: 'Descargar modelos' }).click();
    await expect(voice.getByText(MISSING)).toBeVisible();
    await expect(voice.getByRole('button', { name: 'Descargar modelos' })).toBeEnabled();
    await expect(voice.getByText('Modelos listos')).toHaveCount(0);
    expect(server.requests).toEqual([]);
  } finally {
    await server.close();
  }
});

test('[CA-025] «Decir en voz alta» dice «The weather is nice today» con dos voces distintas y muestra cuánto tardó', async ({
  launch,
}) => {
  // Cargar Kokoro en la máquina del CI lleva varios segundos.
  test.setTimeout(180_000);
  const { page } = await launch(undefined, WITH_MODELS);
  await openLab(page);
  const voice = block(page, 'Voz');
  await expect(voice.getByText('Modelos listos')).toBeVisible();
  await voice.getByRole('textbox', { name: 'Frase en inglés' }).fill('The weather is nice today');

  const durations: number[] = [];
  const sources: string[] = [];
  for (const name of ['Mujer, Estados Unidos', 'Hombre, Reino Unido']) {
    await voice.getByRole('radio', { name }).check();
    await voice.getByRole('button', { name: 'Decir en voz alta' }).click();
    await expect(voice.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible({ timeout: 120_000 });
    const audio = voice.locator('audio');
    await expect(audio).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration)).toBeGreaterThan(1);
    durations.push(await audio.evaluate((a: HTMLAudioElement) => a.duration));
    sources.push((await audio.getAttribute('src')) ?? '');
  }
  expect(new Set(sources).size).toBe(2);
  expect(durations[0]).not.toBe(durations[1]);
});

test('[CA-026] «Grabar», decir «good morning» y «Detener» muestran «Entendí: “good morning”» en un campo que se puede corregir (simulado)', async ({
  launch,
}) => {
  // Cargar Whisper en la máquina del CI lleva varios segundos.
  test.setTimeout(180_000);
  const { page } = await launch(undefined, {
    ...WITH_MODELS,
    RETENIA_MICROFONO_ARCHIVO: join(ROOT, 'datos-de-ejemplo', 'good-morning.wav'),
  });
  await openLab(page);
  const transcription = block(page, 'Transcripción');
  await transcription.getByRole('button', { name: 'Grabar' }).click();
  await expect(transcription.getByText(/^Grabando… 2 s\./)).toBeVisible({ timeout: 20_000 });
  await transcription.getByRole('button', { name: 'Detener' }).click();
  await expect(transcription.getByText('Entendí: “good morning”')).toBeVisible({
    timeout: 60_000,
  });
  const field = transcription.getByRole('textbox', { name: 'Lo que entendí (podés corregirlo)' });
  await expect(field).toHaveValue('good morning');
  await field.fill('good evening');
  await expect(transcription.getByText('Entendí: “good evening”')).toBeVisible();
  await expect(transcription.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible();
});

test('[CA-027] con el micrófono bloqueado en Windows, «Grabar» muestra «Sin acceso al micrófono no podemos escucharte» y «Cómo habilitarlo» (simulado)', async ({
  launch,
}) => {
  const { page } = await launch(undefined, {
    ...WITH_MODELS,
    RETENIA_SIMULAR_MICROFONO: 'bloqueado',
  });
  await openLab(page);
  const transcription = block(page, 'Transcripción');
  await transcription.getByRole('button', { name: 'Grabar' }).click();
  await expect(
    transcription.getByText('Sin acceso al micrófono no podemos escucharte'),
  ).toBeVisible();
  await transcription.getByRole('link', { name: 'Cómo habilitarlo' }).click();
  await expect(
    transcription.getByText('Abrí Configuración de Windows › Privacidad y seguridad › Micrófono.'),
  ).toBeVisible();
  await expect(transcription.getByRole('button', { name: 'Detener' })).toHaveCount(0);
});

test('[CA-028] «Leer PDF de prueba» muestra el texto de la página 1 y una frase resaltada sobre la imagen de la página', async ({
  appWindow,
}) => {
  await openLab(appWindow);
  const pdf = block(appWindow, 'PDF');
  await pdf.getByRole('button', { name: 'Leer PDF de prueba' }).click();
  await expect(pdf.getByText(/Capítulo 1 · Población, muestra y estimadores/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    pdf.getByText(
      'Frase resaltada: “Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.”',
    ),
  ).toBeVisible();
  const image = pdf.getByRole('figure', { name: 'Página 1 con la frase resaltada' });
  await expect(image).toBeVisible();
  // La página está dibujada (no es un recuadro en blanco)…
  await expect
    .poll(() =>
      image.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
        let dark = 0;
        for (let i = 0; i < (pixels?.data.length ?? 0); i += 4) {
          if ((pixels?.data[i] ?? 255) < 128) {
            dark += 1;
          }
        }
        return dark;
      }),
    )
    .toBeGreaterThan(2000);
  // …y la frase resaltada cae sobre ella.
  const marks = image.getByRole('img', { name: 'Frase resaltada' });
  await expect(marks).toHaveCount(2);
  const page = await image.boundingBox();
  for (const mark of await marks.all()) {
    const box = await mark.boundingBox();
    expect(box && page).toBeTruthy();
    if (box && page) {
      expect(box.width).toBeGreaterThan(10);
      expect(box.x).toBeGreaterThanOrEqual(page.x);
      expect(box.y).toBeGreaterThanOrEqual(page.y);
      expect(box.x + box.width).toBeLessThanOrEqual(page.x + page.width);
      expect(box.y + box.height).toBeLessThanOrEqual(page.y + page.height);
    }
  }
  await expect(pdf.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible();
});

test('[CA-029] «Leer página escaneada» muestra el texto de la página 9 aunque es una imagen', async ({
  appWindow,
}) => {
  // Reconocer una página entera lleva varios segundos, más en el CI.
  test.setTimeout(180_000);
  await openLab(appWindow);
  const scan = block(appWindow, 'Escaneo');
  await scan.getByRole('button', { name: 'Leer página escaneada' }).click();
  await expect(scan.getByText(/La hipótesis nula y la alternativa/)).toBeVisible({
    timeout: 120_000,
  });
  await expect(scan.getByText(/se llama hipótesis nula/)).toBeVisible();
  await expect(scan.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible();
});

test('[CA-030] «Probar aviso» manda el aviso de Windows y lo dice', async ({ appWindow }) => {
  await openLab(appWindow);
  const notice = block(appWindow, 'Aviso');
  await notice.getByRole('button', { name: 'Probar aviso' }).click();
  await expect(
    notice.getByText('Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.'),
  ).toBeVisible({ timeout: 20_000 });
  await expect(notice.getByText(/^Tardó \d+(,\d)? s$/)).toBeVisible();
});
