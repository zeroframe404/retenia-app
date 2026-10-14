// «npm run construir»: compila las dos variantes (la de prueba con la demostración y la real
// sin ella) en out/prueba y out/real. El instalador llega en la Fase 03.
import { runPackage } from './lib/proceso.mjs';
import { formatDuration } from './lib/reloj.mjs';

let failed = false;
for (const variant of ['prueba', 'real']) {
  const r = await runPackage('electron-vite', 'electron-vite', ['build'], {
    env: { ...process.env, RETENIA_VARIANTE: variant },
  });
  if (r.code === 0) {
    console.log(
      `Variante «${variant}»: compilada en out/${variant} (${formatDuration(r.durationMs)}).`,
    );
  } else {
    failed = true;
    console.log(`Variante «${variant}»: no compiló.`);
    console.log(r.stdout, r.stderr);
  }
}
process.exitCode = failed ? 1 : 0;
