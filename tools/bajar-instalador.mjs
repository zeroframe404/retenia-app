// «Bajame el instalador de prueba»: baja a tu Escritorio, con gh, el instalador de
// «Retenia (prueba)» que armó el CI para la rama de este pull request, y dice cómo se llama el
// archivo. Es el adjunto «instalador-prueba» de la corrida más reciente que lo tenga.
//   node tools/bajar-instalador.mjs [--rama fase-03]
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT, run } from './lib/proceso.mjs';

const ARTIFACT = 'instalador-prueba';

// Las pruebas reemplazan gh por un guion propio (RETENIA_GH_SCRIPT) y el Escritorio por una
// carpeta temporal (RETENIA_ESCRITORIO): es la frontera externa, la red de GitHub.
const ghCommand = process.env.RETENIA_GH_SCRIPT
  ? [process.execPath, process.env.RETENIA_GH_SCRIPT]
  : ['gh'];
/** @param {string[]} args */
const gh = (args) => run(ghCommand[0] ?? 'gh', [...ghCommand.slice(1), ...args], { cwd: ROOT });
const WORKFLOW = 'Red de pruebas';

/** @param {string} message */
function stop(message) {
  console.log(message);
  process.exit(1);
}

const branchIndex = process.argv.indexOf('--rama');
const branch =
  branchIndex === -1
    ? (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    : (process.argv[branchIndex + 1] ?? '');
if (!branch || branch === 'HEAD') {
  stop(
    'No sé de qué rama bajar el instalador. Decime cuál: node tools/bajar-instalador.mjs --rama fase-03',
  );
}

// El Escritorio de tu cuenta de Windows (puede estar redirigido a OneDrive).
const desktopAsked = process.env.RETENIA_ESCRITORIO
  ? null
  : await run('powershell', ['-NoProfile', '-Command', '[Environment]::GetFolderPath("Desktop")']);
const desktop =
  process.env.RETENIA_ESCRITORIO || desktopAsked?.stdout.trim() || join(homedir(), 'Desktop');

const listed = await gh([
  'run',
  'list',
  '--branch',
  branch,
  '--workflow',
  WORKFLOW,
  '--limit',
  '10',
  '--json',
  'databaseId,status,conclusion,headSha,createdAt',
]);
if (listed.code !== 0) {
  stop(
    `No pude consultar las pruebas de la nube con gh: ${listed.stderr.trim() || listed.stdout.trim()}`,
  );
}
/** @type {{ databaseId: number, status: string, conclusion: string, headSha: string }[]} */
const runs = JSON.parse(listed.stdout || '[]');
if (runs.length === 0) {
  stop(`Las pruebas de la nube todavía no corrieron para la rama ${branch}.`);
}

for (const candidate of runs) {
  const before = new Set(readdirSync(desktop));
  const downloaded = await gh([
    'run',
    'download',
    String(candidate.databaseId),
    '--name',
    ARTIFACT,
    '--dir',
    desktop,
  ]);
  if (downloaded.code !== 0) {
    continue;
  }
  const files = readdirSync(desktop)
    .filter((name) => /^Retenia-prueba-instalador-.+\.exe$/.test(name))
    .map((name) => ({ name, modified: statSync(join(desktop, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  const file = files.find((f) => !before.has(f.name)) ?? files[0];
  if (!file) {
    stop('Bajé el adjunto pero no encontré el instalador adentro.');
  }
  const state =
    candidate.status === 'completed'
      ? candidate.conclusion === 'success'
        ? 'con las pruebas de la nube en verde'
        : 'con las pruebas de la nube en rojo (algo falló en esa corrida)'
      : 'de una corrida que todavía no terminó';
  console.log(`Listo: el instalador quedó en tu Escritorio, ${state}.`);
  console.log(`Se llama: ${file?.name}`);
  console.log(
    `Corrida ${candidate.databaseId} · versión del código ${candidate.headSha.slice(0, 7)}.`,
  );
  process.exit(0);
}

stop(
  `No encontré el adjunto «${ARTIFACT}» en las últimas corridas de ${branch}. Si las pruebas de la nube todavía están corriendo, esperá a que termine el trabajo «Instaladores y humo del instalador»; los adjuntos duran 14 días.`,
);
