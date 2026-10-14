// «npm run datos:reiniciar»: deja la carpeta de datos de demostración en su estado conocido.
import { relative } from 'node:path';
import { DEMO_DATA_DIR, resetDemoData } from './lib/datos.mjs';
import { ROOT } from './lib/proceso.mjs';

try {
  resetDemoData();
  console.log(
    `Listo: la carpeta de datos de demostración (${relative(ROOT, DEMO_DATA_DIR) || DEMO_DATA_DIR}) quedó como nueva. Al abrir Retenia aparecen las tres tarjetas de ejemplo y la fecha vuelve al lunes 15/03/2027.`,
  );
} catch (error) {
  const code = /** @type {{ code?: string }} */ (error).code;
  const busy = code === 'EBUSY' || code === 'EPERM';
  console.log(
    busy
      ? 'No pude reiniciar los datos: Retenia está abierto. Cerralo y volvé a probar.'
      : `No pude reiniciar los datos: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
