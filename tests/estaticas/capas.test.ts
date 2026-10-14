import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { firstJson, packageBin, ROOT, run } from '../../tools/lib/proceso.mjs';

// Una carpeta con la misma regla de capas que el proyecto y archivos de muestra.
const sample = mkdtempSync(join(tmpdir(), 'retenia-capas-'));
afterAll(() => rmSync(sample, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(dirname(join(sample, file)), { recursive: true });
  writeFileSync(join(sample, file), text);
}

describe('regla de capas', () => {
  it('[CA-006] la regla de capas marca a la ventana que importa la base de datos y a quien toca SQLite fuera de data', async () => {
    copyFileSync(join(ROOT, '.dependency-cruiser.cjs'), join(sample, '.dependency-cruiser.cjs'));
    write('src/data/database.ts', "export const file = 'retenia.db';\n");
    write(
      'src/renderer/App.ts',
      "import { file } from '../data/database';\nexport const a = file;\n",
    );
    write(
      'src/main/sqlite.ts',
      "import { DatabaseSync } from 'node:sqlite';\nexport const b = DatabaseSync;\n",
    );
    write(
      'src/data/ok.ts',
      "import { DatabaseSync } from 'node:sqlite';\nexport const c = DatabaseSync;\n",
    );

    const r = await run(
      process.execPath,
      [
        packageBin('dependency-cruiser', 'depcruise'),
        'src',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
      ],
      { cwd: sample },
    );
    const violations = (firstJson(r.stdout)?.summary?.violations ?? []) as {
      from: string;
      to: string;
      rule: { name: string };
    }[];
    expect(violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`).sort()).toEqual([
      'capas-R1-ventana: src/renderer/App.ts -> src/data/database.ts',
      'capas-R8-solo-datos-toca-sqlite-de-node: src/main/sqlite.ts -> node:sqlite',
    ]);
  });
});
