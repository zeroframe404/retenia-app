import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { run } from '../../../tools/lib/proceso.mjs';
import { changedPromptVersions } from '../../../tools/lib/prompts.mjs';

// «Una versión de un prompt no cambia nunca» (Fase 19, objeción del revisor): la huella de cada
// versión en src/ai/prompts/versiones.json tiene que ser la que tuvo la primera vez que entró al
// historial. Cambiar el prompt y pisar la huella de la misma versión da rojo: hay que subir la
// versión. Probado sobre un repositorio de juguete, sin tocar los prompts de verdad.

// Las variables con que git le dice a un gancho dónde está el repositorio real (como en la prueba de
// las migraciones): mientras corre este archivo se borran.
const GIT_LOCATION = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
];
beforeAll(() => {
  for (const name of GIT_LOCATION) {
    vi.stubEnv(name, undefined);
  }
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

async function git(repo: string, ...args: string[]) {
  const result = await run(
    'git',
    ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.com', ...args],
    { cwd: repo },
  );
  expect(result.code, result.stderr).toBe(0);
}

const LOCKS = join('src', 'ai', 'prompts', 'versiones.json');

async function repoWithLocks(locks: Record<string, Record<string, string>>) {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'retenia-prompts-')));
  repos.push(repo);
  mkdirSync(join(repo, 'src', 'ai', 'prompts'), { recursive: true });
  writeFileSync(join(repo, LOCKS), `${JSON.stringify(locks)}\n`);
  await git(repo, 'init', '-q', '-b', 'main');
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '-q', '-m', 'primer prompt');
  return repo;
}

const write = (repo: string, locks: Record<string, Record<string, string>>) =>
  writeFileSync(join(repo, LOCKS), `${JSON.stringify(locks)}\n`);

describe('las versiones de los prompts no cambian', { timeout: 60_000 }, () => {
  it('sin cambios no hay nada que decir', async () => {
    const repo = await repoWithLocks({ explicar: { '1': 'aaa' } });
    expect(await changedPromptVersions(repo)).toEqual([]);
  });

  it('pisar la huella de una versión que ya entró al historial da rojo, aunque se haga commit', async () => {
    const repo = await repoWithLocks({ explicar: { '1': 'aaa' } });
    write(repo, { explicar: { '1': 'bbb' } });
    expect(await changedPromptVersions(repo)).toEqual([
      { prompt: 'explicar', version: '1', problem: 'cambió' },
    ]);
    await git(repo, 'commit', '-q', '-am', 'otra huella para la misma versión');
    expect(await changedPromptVersions(repo)).toEqual([
      { prompt: 'explicar', version: '1', problem: 'cambió' },
    ]);
  });

  it('sacar una versión del historial da rojo', async () => {
    const repo = await repoWithLocks({ explicar: { '1': 'aaa' } });
    write(repo, { explicar: { '2': 'bbb' } });
    expect(await changedPromptVersions(repo)).toEqual([
      { prompt: 'explicar', version: '1', problem: 'ya no existe' },
    ]);
  });

  it('subir la versión (la 1 igual y una 2 nueva) está bien', async () => {
    const repo = await repoWithLocks({ explicar: { '1': 'aaa' } });
    write(repo, { explicar: { '1': 'aaa', '2': 'bbb' } });
    expect(await changedPromptVersions(repo)).toEqual([]);
  });
});
