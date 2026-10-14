import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packageBin, run } from '../../tools/lib/proceso.mjs';
import { copyProject, git, removeCopy, runNetworkIn, verdictLines } from '../apoyo/red';
import { applySabotage } from '../sabotage/sabotajes.mjs';

describe('sabotaje 2', () => {
  let copy = '';
  beforeAll(async () => {
    copy = await copyProject();
    // Los ganchos de git instalados en la copia, como en tu PC.
    await run(process.execPath, [packageBin('lefthook', 'lefthook', copy), 'install'], {
      cwd: copy,
    });
  });
  afterAll(() => removeCopy(copy));

  it('[CA-004] sabotaje 2: una clave falsa en un archivo frena el commit y la red da ROJO nombrando «secreto», y al revertir vuelve a VERDE', async () => {
    const { files, revert } = applySabotage(2, copy);

    await git(copy, 'add', ...files);
    const commit = await git(copy, 'commit', '-m', 'sabotaje 2');
    expect(commit.code).not.toBe(0);
    expect(`${commit.stdout}\n${commit.stderr}`).toContain('secreto');
    const history = await git(copy, 'rev-list', '--count', 'HEAD');
    expect(history.stdout.trim()).toBe('1');

    const red = verdictLines((await runNetworkIn(copy)).stdout);
    expect(red[0], red.join('\n')).toMatch(/^ROJO · /);
    expect(red.join('\n')).toContain('secreto');

    await git(copy, 'reset', '-q', '--', ...files);
    revert();
    const green = verdictLines((await runNetworkIn(copy)).stdout);
    expect(green[0], green.join('\n')).toMatch(/^VERDE · /);
  });
});
