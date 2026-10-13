// «npm run construir»: compila las dos variantes (la de prueba con la demostración y la real
// sin ella) en out/prueba y out/real. El instalador llega en la Fase 03.
import { correrPaquete } from './lib/proceso.mjs';
import { formatearDuracion } from './lib/reloj.mjs';

let fallo = false;
for (const variante of ['prueba', 'real']) {
  const r = await correrPaquete('electron-vite', 'electron-vite', ['build'], {
    env: { ...process.env, RETENIA_VARIANTE: variante },
  });
  if (r.codigo === 0) {
    console.log(
      `Variante «${variante}»: compilada en out/${variante} (${formatearDuracion(r.duracionMs)}).`,
    );
  } else {
    fallo = true;
    console.log(`Variante «${variante}»: no compiló.`);
    console.log(r.salida, r.errores);
  }
}
process.exitCode = fallo ? 1 : 0;
