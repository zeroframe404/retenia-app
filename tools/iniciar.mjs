// «npm run iniciar»: compila la variante de prueba y abre Retenia en modo demostración,
// con la carpeta de datos de demostración del proyecto (datos-locales/demostracion).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DEMO_DATA_DIR } from './lib/datos.mjs';
import { ROOT, runPackage } from './lib/proceso.mjs';

console.log('Preparando Retenia en modo demostración…');
const built = await runPackage('electron-vite', 'electron-vite', ['build'], {
  env: { ...process.env, RETENIA_VARIANTE: 'prueba' },
});
if (built.code !== 0) {
  console.log('No pude preparar Retenia. Esto es lo que dijo el compilador:');
  console.log(built.stdout, built.stderr);
  process.exit(1);
}

mkdirSync(DEMO_DATA_DIR, { recursive: true });
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, RETENIA_DATOS: DEMO_DATA_DIR };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, [join(ROOT, 'out', 'prueba', 'main', 'index.js')], {
  env,
  stdio: 'inherit',
});
console.log('Retenia está abierto. Cuando cierres la ventana vuelve la terminal.');
app.on('close', (code) => process.exit(code ?? 0));
