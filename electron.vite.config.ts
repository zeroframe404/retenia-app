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
    build: { outDir: resolve(out, 'main') },
  },
  preload: {
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
