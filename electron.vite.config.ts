import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

// Variante de compilación: «prueba» trae el modo demostración; «real» no lo trae.
// Sin variable de entorno se compila la real, para no llevar la demostración por descuido.
const variant = process.env.RETENIA_VARIANTE === 'prueba' ? 'prueba' : 'real';
const out = resolve(import.meta.dirname, 'out', variant);
const define = { __VARIANTE__: JSON.stringify(variant) };

// La versión real todavía no dibuja PDF (el visor lo usa solo el Laboratorio). Su pantalla se
// descarta al compilar, pero Vite igual copiaría el hilo de trabajo de pdf.js a la ventana: en la
// real, pdf.js se reemplaza por un módulo vacío.
const EMPTY_PDFJS = '\0retenia-sin-pdfjs';
const withoutPdfjs: Plugin = {
  name: 'retenia-sin-pdfjs',
  enforce: 'pre',
  resolveId: (id) => (id.startsWith('pdfjs-dist') ? EMPTY_PDFJS : null),
  load: (id) =>
    id === EMPTY_PDFJS
      ? 'export default ""; export const GlobalWorkerOptions = {}; export function getDocument() { throw new Error("pdf.js no viene en esta versión"); }'
      : null,
  // Si algo de la versión real llega a usar pdf.js, la compilación falla en vez de dejar una
  // página en blanco: el día que el visor entre a la real, se saca este complemento.
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && output.moduleIds.includes(EMPTY_PDFJS)) {
        this.error(
          'La versión real usa pdf.js, que hoy le llega vacío: sacá el complemento retenia-sin-pdfjs de electron.vite.config.ts.',
        );
      }
    }
  },
};

export default defineConfig({
  main: {
    define,
    build: {
      outDir: resolve(out, 'main'),
      // Todo va adentro del archivo menos los paquetes con partes nativas o archivos propios
      // (better-sqlite3, sherpa-onnx, tesseract.js y sus idiomas, pdf.js), que viajan aparte.
      externalizeDeps: { exclude: ['drizzle-orm', 'ts-fsrs', 'zod'] },
      rollupOptions: {
        // Los procesos de trabajo de voz y de materiales: por ahora los usa solo el
        // Laboratorio, que existe solo en la variante de prueba.
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          ...(variant === 'prueba'
            ? {
                voice: resolve(import.meta.dirname, 'src/main/workers/voice.ts'),
                materials: resolve(import.meta.dirname, 'src/main/workers/materials.ts'),
              }
            : {}),
        },
      },
    },
  },
  preload: {
    define,
    // La ventana corre con sandbox: el puente tiene que ser un solo archivo CommonJS,
    // con Zod adentro.
    build: {
      outDir: resolve(out, 'preload'),
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs' } },
    },
  },
  renderer: {
    define,
    plugins: [react(), ...(variant === 'real' ? [withoutPdfjs] : [])],
    build: {
      outDir: resolve(out, 'renderer'),
      // Las tipografías (las de KaTeX incluidas) viajan siempre como archivos: la política de
      // contenido de la ventana (`font-src 'self'`) no deja usar una incrustada como `data:`, y
      // Vite incrusta por defecto lo que pesa menos de 4 KB.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
    },
  },
});
