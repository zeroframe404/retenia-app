import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changedMigrations } from '../../../tools/lib/migraciones.mjs';
import { run } from '../../../tools/lib/proceso.mjs';

// La regla «una migración aplicada no se edita», probada sobre un repositorio de juguete: así se
// la ve en rojo sin tocar las migraciones reales.

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

async function repoWithMigration() {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'retenia-migraciones-')));
  repos.push(repo);
  const folder = join(repo, 'src', 'data', 'migrations');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(join(folder, '0000_tarjetas.sql'), 'CREATE TABLE `cards` (`id` text);\n');
  writeFileSync(join(folder, 'meta', '0000_snapshot.json'), '{"version":"6"}\n');
  writeFileSync(join(folder, 'meta', '_journal.json'), '{"entries":[0]}\n');
  await git(repo, 'init', '-q', '-b', 'main');
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '-q', '-m', 'primera migración');
  return { repo, folder };
}

describe('migraciones que no cambian', () => {
  it('sin cambios no hay nada que decir', async () => {
    const { repo } = await repoWithMigration();
    expect(await changedMigrations(repo)).toEqual([]);
  });

  it('una migración del historial editada, aunque sea sin commit, da rojo', async () => {
    const { repo, folder } = await repoWithMigration();
    writeFileSync(
      join(folder, '0000_tarjetas.sql'),
      'CREATE TABLE `cards` (`id` text, `extra` text);\n',
    );
    expect(await changedMigrations(repo)).toEqual([
      { path: 'src/data/migrations/0000_tarjetas.sql', problem: 'cambió' },
    ]);
  });

  it('una migración editada y guardada en otro commit también da rojo', async () => {
    const { repo, folder } = await repoWithMigration();
    writeFileSync(join(folder, 'meta', '0000_snapshot.json'), '{"version":"7"}\n');
    await git(repo, 'commit', '-q', '-am', 'cambio');
    expect(await changedMigrations(repo)).toEqual([
      { path: 'src/data/migrations/meta/0000_snapshot.json', problem: 'cambió' },
    ]);
  });

  it('renombrar o borrar una migración del historial da rojo', async () => {
    const { repo, folder } = await repoWithMigration();
    renameSync(join(folder, '0000_tarjetas.sql'), join(folder, '0000_otro_nombre.sql'));
    expect(await changedMigrations(repo)).toEqual([
      { path: 'src/data/migrations/0000_tarjetas.sql', problem: 'ya no existe' },
    ]);
  });

  it('una migración nueva todavía sin commit y los cambios del diario no cuentan', async () => {
    const { repo, folder } = await repoWithMigration();
    writeFileSync(join(folder, '0001_nueva.sql'), 'CREATE TABLE `otra` (`id` text);\n');
    writeFileSync(join(folder, 'meta', '_journal.json'), '{"entries":[0,1]}\n');
    expect(await changedMigrations(repo)).toEqual([]);
  });

  it('un salto de línea de Windows no cuenta como cambio', async () => {
    const { repo, folder } = await repoWithMigration();
    writeFileSync(join(folder, '0000_tarjetas.sql'), 'CREATE TABLE `cards` (`id` text);\r\n');
    expect(await changedMigrations(repo)).toEqual([]);
  });
});
