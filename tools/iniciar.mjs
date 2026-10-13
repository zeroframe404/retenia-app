// «npm run iniciar»: compila la variante de prueba y abre Retenia en modo demostración,
// con la carpeta de datos de demostración del proyecto (datos-locales/demostracion).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CARPETA_DE_DEMOSTRACION } from './lib/datos.mjs';
import { correrPaquete, RAIZ } from './lib/proceso.mjs';

console.log('Preparando Retenia en modo demostración…');
const compilado = await correrPaquete('electron-vite', 'electron-vite', ['build'], {
  env: { ...process.env, RETENIA_VARIANTE: 'prueba' },
});
if (compilado.codigo !== 0) {
  console.log('No pude preparar Retenia. Esto es lo que dijo el compilador:');
  console.log(compilado.salida, compilado.errores);
  process.exit(1);
}

mkdirSync(CARPETA_DE_DEMOSTRACION, { recursive: true });
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, RETENIA_DATOS: CARPETA_DE_DEMOSTRACION };
delete env.ELECTRON_RUN_AS_NODE;
const ventana = spawn(electron, [join(RAIZ, 'out', 'prueba', 'main', 'index.js')], {
  env,
  stdio: 'inherit',
});
console.log('Retenia está abierto. Cuando cierres la ventana vuelve la terminal.');
ventana.on('close', (codigo) => process.exit(codigo ?? 0));
