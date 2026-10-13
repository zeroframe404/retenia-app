// «npm run datos:reiniciar»: deja la carpeta de datos de demostración en su estado conocido.
import { relative } from 'node:path';
import { CARPETA_DE_DEMOSTRACION, reiniciarDatosDeDemostracion } from './lib/datos.mjs';
import { RAIZ } from './lib/proceso.mjs';

try {
  reiniciarDatosDeDemostracion();
  console.log(
    `Listo: la carpeta de datos de demostración (${relative(RAIZ, CARPETA_DE_DEMOSTRACION) || CARPETA_DE_DEMOSTRACION}) quedó como nueva.`,
  );
} catch (error) {
  const ocupada = error?.code === 'EBUSY' || error?.code === 'EPERM';
  console.log(
    ocupada
      ? 'No pude reiniciar los datos: Retenia está abierto. Cerralo y volvé a probar.'
      : `No pude reiniciar los datos: ${error?.message ?? error}`,
  );
  process.exitCode = 1;
}
