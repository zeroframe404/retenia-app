// «npm run construir»: compila las dos variantes (la de prueba con la demostración y la real
// sin ella) en out/prueba y out/real y arma de cada una el programa sin instalar, en
// release/<variante>/win-unpacked. Con --instalador arma además el instalador (NSIS) de cada
// una, en release/<variante>. Con --solo prueba (o real) hace una sola.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, runPackage } from './lib/proceso.mjs';
import { formatDuration } from './lib/reloj.mjs';

const withInstaller = process.argv.includes('--instalador');
const onlyIndex = process.argv.indexOf('--solo');
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
const variants = ['prueba', 'real'].filter((variant) => only === null || variant === only);

/** @param {number} bytes */
function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

let failed = false;
for (const variant of variants) {
  const compiled = await runPackage('electron-vite', 'electron-vite', ['build'], {
    env: { ...process.env, RETENIA_VARIANTE: variant },
  });
  if (compiled.code !== 0) {
    failed = true;
    console.log(`Variante «${variant}»: no compiló.`);
    console.log(compiled.stdout, compiled.stderr);
    continue;
  }
  console.log(
    `Variante «${variant}»: compilada en out/${variant} (${formatDuration(compiled.durationMs)}).`,
  );

  rmSync(join(ROOT, 'release', variant), { recursive: true, force: true });
  const packaged = await runPackage(
    'electron-builder',
    'electron-builder',
    [
      '--config',
      `electron-builder.${variant}.yml`,
      '--publish',
      'never',
      ...(withInstaller ? ['--win', 'nsis'] : ['--dir']),
    ],
    { timeoutMs: 900_000 },
  );
  if (packaged.code !== 0) {
    failed = true;
    console.log(`Variante «${variant}»: no pude armar el paquete.`);
    console.log(packaged.stdout, packaged.stderr);
    continue;
  }
  console.log(
    `Variante «${variant}»: programa sin instalar en release/${variant}/win-unpacked (${formatDuration(packaged.durationMs)}).`,
  );
  if (withInstaller) {
    const folder = join(ROOT, 'release', variant);
    const installers = existsSync(folder)
      ? readdirSync(folder).filter((name) => name.endsWith('.exe'))
      : [];
    for (const name of installers) {
      console.log(
        `Variante «${variant}»: instalador release/${variant}/${name} (${megabytes(statSync(join(folder, name)).size)}).`,
      );
    }
    if (installers.length === 0) {
      failed = true;
      console.log(`Variante «${variant}»: no encontré el instalador.`);
    }
  }
}
process.exitCode = failed ? 1 : 0;
