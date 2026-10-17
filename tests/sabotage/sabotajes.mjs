// Los cuatro sabotajes de la Fase 02 (H-01). Cada uno rompe algo a propósito para demostrar
// que la red lo detecta: applySabotage() lo rompe y devuelve cómo revertirlo.
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @typedef {{ file: string, change: (text: string) => string }} Change
 * @typedef {{ name: string, expects: string, changes: Change[] }} Sabotage
 */

/** @param {string} text @param {string} before @param {string} after */
function replaceOnce(text, before, after) {
  if (!text.includes(before)) {
    throw new Error(`El sabotaje no encontró lo que tenía que cambiar: «${before}»`);
  }
  return text.replace(before, after);
}

// Una clave con el formato real de Anthropic, armada en el momento para que no quede escrita
// en ningún archivo del repositorio. No sirve para nada: es falsa.
function fakeKey() {
  return `sk-ant-${'api03'}-${'Sabotaje2NoEsReal'.repeat(5)}${'x'.repeat(8)}AA`;
}

/** @type {Record<number, Sabotage>} */
export const SABOTAGES = {
  1: {
    name: 'una regla rota: el día de estudio corta a las 00:00 en vez de a las 04:00',
    expects: 'día de estudio',
    changes: [
      {
        file: 'src/core/study-day/index.ts',
        change: (t) =>
          replaceOnce(t, 'const STUDY_DAY_CUTOFF_HOUR = 4;', 'const STUDY_DAY_CUTOFF_HOUR = 0;'),
      },
    ],
  },
  2: {
    name: 'una clave falsa escrita en un archivo del proyecto',
    expects: 'secreto',
    changes: [
      {
        file: 'ajustes-ia.json',
        change: () => `${JSON.stringify({ anthropicApiKey: fakeKey() }, null, 2)}\n`,
      },
    ],
  },
  3: {
    name: 'una prueba salteada',
    expects: '1 salteada',
    changes: [
      {
        file: 'tests/unitarias/study-day.test.ts',
        change: (t) =>
          replaceOnce(
            t,
            "it('[CA-002] el día de estudio no depende",
            `it.${'skip'}('[CA-002] el día de estudio no depende`,
          ),
      },
    ],
  },
  4: {
    name: 'capas mezcladas: la ventana importa directamente la base de datos',
    expects: 'capas',
    changes: [
      {
        file: 'src/data/database.ts',
        change: () =>
          "// Sabotaje 4: una base de datos que la ventana nunca debería tocar.\nexport function openDatabase(): string {\n  return 'retenia.db';\n}\n",
      },
      {
        file: 'src/renderer/App.tsx',
        change: (t) =>
          replaceOnce(
            replaceOnce(
              t,
              "import { texts } from '../preload/contract/texts';",
              "import { openDatabase } from '../data/database';\nimport { texts } from '../preload/contract/texts';",
            ),
            '<main ref={content} className={styles.content} aria-label={texts.appName}>',
            '<main ref={content} className={styles.content} aria-label={texts.appName} data-base={openDatabase()}>',
          ),
      },
    ],
  },
};

/** @param {string} root */
function backupPath(root) {
  return join(root, '.cache', 'sabotaje', 'en-curso.json');
}

// Si una corrida anterior quedó cortada con un sabotaje puesto, lo deshace.
/** @param {string} root */
export function restoreLeftover(root) {
  const path = backupPath(root);
  if (!existsSync(path)) {
    return false;
  }
  /** @type {{ file: string, original: string | null }[]} */
  const originals = JSON.parse(readFileSync(path, 'utf8'));
  for (const { file, original } of originals) {
    const target = join(root, file);
    if (original === null) {
      rmSync(target, { force: true });
      try {
        rmdirSync(dirname(target));
      } catch {
        // La carpeta ya existía con otras cosas: queda como estaba.
      }
    } else {
      writeFileSync(target, original);
    }
  }
  rmSync(path, { force: true });
  return true;
}

/** @param {number} number @param {string} root */
export function applySabotage(number, root) {
  const sabotage = SABOTAGES[number];
  if (!sabotage) {
    throw new Error(`No existe el sabotaje ${number}: hay del 1 al 4.`);
  }
  restoreLeftover(root);
  const originals = sabotage.changes.map(({ file }) => {
    const path = join(root, file);
    return { file, original: existsSync(path) ? readFileSync(path, 'utf8') : null };
  });
  mkdirSync(dirname(backupPath(root)), { recursive: true });
  writeFileSync(backupPath(root), JSON.stringify(originals));
  sabotage.changes.forEach(({ file, change }, i) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, change(originals[i]?.original ?? ''));
  });
  return {
    files: sabotage.changes.map((c) => c.file),
    revert: () => restoreLeftover(root),
  };
}
