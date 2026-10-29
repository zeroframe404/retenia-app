// «node tools/generar-datos-de-ejemplo.mjs»: arma los archivos de datos-de-ejemplo que usa el
// elenco (docs/especificacion/elenco.md) a partir del texto propio de
// tools/datos-de-ejemplo/contenido.mjs. Los PDF salen del motor de impresión de Electron (el
// mismo Chromium de Retenia): la página 9 de «Inferencia — capítulos 1 a 4.pdf» es una imagen
// de un escaneo, sin capa de texto. El audio «good morning» lo dice Kokoro con los modelos de
// desarrollo (node tools/preparar.mjs los baja). La campana de Gauss del elenco (campana.png, que
// también va embebida en elenco/materias.json) la arma tools/datos-de-ejemplo/campana.mjs. Los
// archivos quedan en el repositorio: esto solo se vuelve a correr si cambia el contenido.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBellCurve } from './datos-de-ejemplo/campana.mjs';
import * as content from './datos-de-ejemplo/contenido.mjs';
import { documentHtml, docx, scanHtml } from './datos-de-ejemplo/documentos.mjs';
import { DEV_MODELS_DIR } from './lib/modelos.mjs';

const require = createRequire(import.meta.url);
const OUT = join(import.meta.dirname, '..', 'datos-de-ejemplo');

// A4 a 200 puntos por pulgada.
const SCAN_WIDTH = 1654;
const SCAN_HEIGHT = 2339;

/** @param {string} html */
const dataUrl = (html) => `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;

/** @param {import('electron').BrowserWindow} page */
const waitForTitle = (page) =>
  new Promise((resolve) => {
    const check = () =>
      page.webContents.getTitle() === 'listo' ? resolve(undefined) : setTimeout(check, 50);
    check();
  });

/** @param {typeof import('electron').BrowserWindow} BrowserWindow */
async function scanImage(BrowserWindow) {
  const page = new BrowserWindow({ show: false });
  await page.loadURL(dataUrl(scanHtml(content.SCANNED_PAGE, SCAN_WIDTH, SCAN_HEIGHT)));
  await waitForTitle(page);
  const jpeg = String(await page.webContents.executeJavaScript('window.escaneo'));
  page.destroy();
  return Buffer.from(jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
}

/**
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @param {{ title: string, pages: any[][], file: string, scan: Buffer }} doc
 */
async function printPdf(BrowserWindow, { title, pages, file, scan }) {
  const page = new BrowserWindow({ show: false });
  // El documento y la imagen del escaneo van por una carpeta temporal: con la imagen adentro,
  // el documento es demasiado grande para una dirección «data:».
  const folder = mkdtempSync(join(tmpdir(), 'retenia-ejemplo-'));
  const html = join(folder, 'documento.html');
  writeFileSync(join(folder, 'escaneo.jpg'), scan);
  writeFileSync(
    html,
    documentHtml(title, pages, () => 'escaneo.jpg'),
  );
  await page.loadFile(html);
  await page.webContents.executeJavaScript(
    'Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]).then(() => true)',
  );
  const pdf = await page.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    generateTaggedPDF: false,
    generateDocumentOutline: false,
  });
  page.destroy();
  rmSync(folder, { recursive: true, force: true });
  writeFileSync(join(OUT, file), pdf);
  console.log(`  ${file} (${Math.round(pdf.length / 1024)} KB)`);
}

// «Good morning.» con la voz am_michael de Kokoro, a 16 kHz, con medio segundo de silencio
// antes y dos y medio después (el micrófono simulado de la punta a punta lo repite en ciclo) y
// un ruido de fondo suave con semilla fija, como un micrófono de verdad.
function goodMorningWav() {
  const sherpa = require('sherpa-onnx-node');
  const K = join(DEV_MODELS_DIR, 'kokoro');
  const tts = new sherpa.OfflineTts({
    model: {
      kokoro: {
        model: join(K, 'model.int8.onnx'),
        voices: join(K, 'voices.bin'),
        tokens: join(K, 'tokens.txt'),
        dataDir: join(K, 'espeak-ng-data'),
        lexicon: `${join(K, 'lexicon-us-en.txt')},${join(K, 'lexicon-gb-en.txt')}`,
        lang: 'en-us',
      },
      numThreads: 2,
    },
  });
  const spoken = tts.generate({
    text: content.GOOD_MORNING,
    sid: 16,
    speed: 1.0,
    enableExternalBuffer: false,
  });
  const rate = 16000;
  const voice = new sherpa.LinearResampler(spoken.sampleRate, rate).flush(spoken.samples);
  const before = Math.round(rate * 0.5);
  const samples = new Float32Array(before + voice.length + Math.round(rate * 2.5));
  samples.set(voice, before);
  let seed = 7;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    samples[i] = (samples[i] ?? 0) * 0.8 + (seed / 2147483648 - 0.5) * 0.004;
  }
  sherpa.writeWave(join(OUT, 'good-morning.wav'), { samples, sampleRate: rate });
  console.log(`  good-morning.wav (${(samples.length / rate).toFixed(1)} s)`);
}

/** @param {typeof import('electron')} electron */
async function generate({ app, BrowserWindow }) {
  try {
    mkdirSync(OUT, { recursive: true });
    console.log('Generando datos-de-ejemplo:');
    const scan = await scanImage(BrowserWindow);
    await printPdf(BrowserWindow, {
      title: 'Inferencia — capítulos 1 a 4',
      pages: content.INFERENCE_PAGES,
      file: 'Inferencia — capítulos 1 a 4.pdf',
      scan,
    });
    await printPdf(BrowserWindow, {
      title: 'Apunte 3',
      pages: content.APUNTE_3_PAGES,
      file: 'Apunte 3.pdf',
      scan,
    });
    writeFileSync(join(OUT, 'notas.md'), content.NOTES_MD);
    writeFileSync(join(OUT, 'resumen.docx'), docx(content.SUMMARY_DOCX));
    writeFileSync(join(OUT, 'pagina.html'), content.WEB_PAGE_HTML);
    writeFileSync(join(OUT, 'no-es-un-pdf.pdf'), content.NOT_A_PDF);
    console.log('  notas.md, resumen.docx, pagina.html, no-es-un-pdf.pdf');
    console.log(
      `  campana.png (${Math.round(writeBellCurve(OUT) / 1024)} KB, también en el elenco)`,
    );
    goodMorningWav();
    app.exit(0);
  } catch (error) {
    console.log('No pude generar los datos de ejemplo:', error);
    app.exit(1);
  }
}

if (process.versions.electron) {
  const electron = await import('electron');
  // Cada ventana se cierra al terminar su parte: sin esto, Electron se iría al cerrar la primera.
  electron.app.on('window-all-closed', () => undefined);
  // Electron recién avisa que está listo cuando termina de cargar este módulo: esperarlo acá
  // arriba lo trabaría.
  electron.app.whenReady().then(() => generate(electron));
} else {
  // Desde Node: se vuelve a abrir a sí mismo dentro de Electron.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [import.meta.filename], { env, stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 1));
}
