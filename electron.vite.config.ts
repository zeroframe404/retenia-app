import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Variante de compilación: «prueba» trae el modo demostración; «real» no lo trae.
// Sin variable de entorno se compila la real, para no llevar la demostración por descuido.
const variant = process.env.RETENIA_VARIANTE === 'prueba' ? 'prueba' : 'real';
const out = resolve(import.meta.dirname, 'out', variant);
const define = { __VARIANTE__: JSON.stringify(variant) };

export default defineConfig({
  main: {
    define,
    build: {
      outDir: resolve(out, 'main'),
      // Todo va adentro del archivo menos los paquetes con partes nativas o archivos propios
      // (better-sqlite3, sherpa-onnx, tesseract.js y sus idiomas, pdf.js), que viajan aparte.
      // El SDK de Anthropic (Fase 19) también va adentro: lo usa solo la compuerta de IA.
      externalizeDeps: { exclude: ['drizzle-orm', 'ts-fsrs', 'zod', '@anthropic-ai/sdk'] },
      rollupOptions: {
        // Los procesos de trabajo: el de materiales va en las dos variantes (Fase 13); el de voz,
        // por ahora, solo en la de prueba (lo usa el Laboratorio).
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          materials: resolve(import.meta.dirname, 'src/main/workers/materials.ts'),
          // Importar y exportar (Fase 15), en las dos variantes.
          transfers: resolve(import.meta.dirname, 'src/main/workers/transfers.ts'),
          ...(variant === 'prueba'
            ? { voice: resolve(import.meta.dirname, 'src/main/workers/voice.ts') }
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
    plugins: [react()],
    build: {
      outDir: resolve(out, 'renderer'),
      // Las tipografías (las de KaTeX incluidas) viajan siempre como archivos: la política de
      // contenido de la ventana (`font-src 'self'`) no deja usar una incrustada como `data:`, y
      // Vite incrusta por defecto lo que pesa menos de 4 KB.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
    },
  },
});
