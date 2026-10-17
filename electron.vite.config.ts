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
    plugins: [react()],
    build: { outDir: resolve(out, 'renderer') },
  },
});
