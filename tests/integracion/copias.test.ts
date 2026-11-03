import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock, fixedClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { holdFile } from '../apoyo/archivo-tomado';
import { tempDataFolder } from '../apoyo/base';
import { dumpTables, readRows } from '../apoyo/base-cruda';
import { inBuenosAires } from '../apoyo/fechas';

// Las copias de seguridad (H-05): «Hacer copia ahora», restaurar y la copia automática al abrir.
// Todo con la base real y archivos reales en una carpeta de datos temporal.

const HOUR_MS = 3_600_000;
const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];
afterEach(() => {
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function dataFolder() {
  const folder = tempDataFolder();
  folders.push(folder);
  return folder;
}

function workspaceAt(dataDir: string, clock: Clock = demoClock()) {
  const workspace = openWorkspace({ dataDir, clock, appVersion: '0.0.0-prueba' });
  open.push(workspace);
  return workspace;
}

// Con un aviso en cada paso con archivos de una copia o una restauración, para provocar una
// falla justo en uno de ellos.
function workspaceWithSteps(dataDir: string, onStep: (name: string) => void) {
  const workspace = openWorkspace({
    dataDir,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
    onStep,
  });
  open.push(workspace);
  return workspace;
}

function closeWorkspace(workspace: Workspace) {
  workspace.close();
  open.splice(open.indexOf(workspace), 1);
}

// Tres tarjetas con repasos y una edición.
function withData(workspace: Workspace) {
  const a = workspace.cards.create({
    question: '¿Qué mide el desvío estándar?',
    answer: 'Dispersión',
  });
  const b = workspace.cards.create({ question: '¿Qué es la varianza?', answer: 'El cuadrado' });
  workspace.cards.create({ question: '¿Qué es la media muestral?', answer: 'El promedio' });
  workspace.cards.review({ cardId: a.id, grade: 'good', attemptId: randomUUID() });
  workspace.cards.review({ cardId: b.id, grade: 'hard', attemptId: randomUUID() });
  workspace.cards.edit({
    cardId: b.id,
    question: '¿Qué es la varianza? (editada)',
    answer: 'El cuadrado',
  });
  return { a, b };
}

const copyFiles = (dataDir: string) =>
  existsSync(join(dataDir, 'copias'))
    ? readdirSync(join(dataDir, 'copias')).filter((name) => name.endsWith('.retenia-copia'))
    : [];

// Una copia por dentro: el renglón del manifiesto y, después, la base.
function unpack(file: string) {
  const content = gunzipSync(readFileSync(file));
  const newline = content.indexOf(0x0a);
  return {
    manifest: JSON.parse(content.subarray(0, newline).toString('utf8')) as Record<string, unknown>,
    database: content.subarray(newline + 1),
  };
}

function databaseOf(file: string, folder: string): string {
  const target = join(folder, `extraida-${randomUUID()}.db`);
  writeFileSync(target, unpack(file).database);
  return target;
}

describe('«Hacer copia ahora»', () => {
  it('[CA-019] una copia que se cortó después de hecha ya no dice «Verificada» ni se ofrece para restaurar', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    const file = join(folder, 'copias', copyFiles(folder)[0] ?? '');
    const whole = readFileSync(file);
    const cut = whole.subarray(0, Math.floor(whole.length / 2));
    writeFileSync(file, cut);

    expect(await workspace.backups()).toEqual([
      {
        id: null,
        kind: null,
        createdAt: null,
        day: null,
        time: null,
        sizeBytes: cut.length,
        readable: false,
      },
    ]);
    await expect(workspace.restoreBackup(copy.id)).rejects.toThrow();
  });

  it('[CA-019] crea un archivo comprimido con la base, un manifiesto y su huella, lo abre y lo cuenta: «Verificada», 15/03/2027', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    const view = await workspace.createBackup('manual');

    const [name] = copyFiles(folder);
    expect(copyFiles(folder)).toHaveLength(1);
    expect(name).toMatch(/^2027-03-15-1000-hecha-por-vos-[0-9a-f]{8}\.retenia-copia$/);
    expect(readdirSync(join(folder, 'copias')).filter((file) => file.endsWith('.tmp'))).toEqual([]);

    const file = join(folder, 'copias', name ?? '');
    const { manifest, database } = unpack(file);
    expect(manifest).toMatchObject({
      format: 'retenia-copia',
      formatVersion: 1,
      id: view.id,
      kind: 'manual',
      createdAt: '2027-03-15T13:00:00.000Z',
      appVersion: '0.0.0-prueba',
      databaseBytes: database.length,
      databaseSha256: createHash('sha256').update(database).digest('hex'),
    });
    expect(manifest.counts).toMatchObject({ cards: 3, card_versions: 4, observations: 2 });
    expect(manifest.migrations).toEqual([
      '0000_tarjetas',
      '0001_libro_mayor',
      '0002_libro_mayor_disparadores',
      '0003_materias_apuntes',
      '0004_apuntes_disparadores',
    ]);

    // La base de adentro es una base de verdad, con las tres tarjetas.
    const inside = databaseOf(file, folder);
    expect(readRows(inside, 'SELECT count(*) AS n FROM cards')).toEqual([{ n: 3 }]);

    expect(view).toEqual({
      id: manifest.id,
      kind: 'manual',
      createdAt: '2027-03-15T13:00:00.000Z',
      day: '2027-03-15',
      time: '10:00',
      sizeBytes: statSync(file).size,
      readable: true,
    });
    expect(await workspace.backups()).toEqual([view]);
  });

  it('dos copias del mismo minuto no chocan y la más nueva queda primera', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    const first = await workspace.createBackup('manual');
    const second = await workspace.createBackup('manual');
    expect(copyFiles(folder)).toHaveLength(2);
    expect((await workspace.backups()).map((backup) => backup.id)).toEqual([second.id, first.id]);
  });

  it('una copia que no se puede abrir se ve como tal y no se ofrece para restaurar', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    await workspace.createBackup('manual');
    writeFileSync(
      join(folder, 'copias', '2027-03-14-1000-automatica-deadbeef.retenia-copia'),
      'no es una copia',
    );
    const listed = await workspace.backups();
    expect(listed).toHaveLength(2);
    expect(listed.filter((backup) => !backup.readable)).toEqual([
      {
        id: null,
        kind: null,
        createdAt: null,
        day: null,
        time: null,
        sizeBytes: 15,
        readable: false,
      },
    ]);
  });
});

describe('restaurar una copia', () => {
  it('[CA-020] eliminar «¿Qué mide el desvío estándar?», vaciar la papelera y restaurar la copia de hoy la devuelve con sus dos renglones de historial', async () => {
    const { folder } = dataFolder();
    const monday = workspaceAt(folder);
    const card = monday.cards.create({
      question: '¿Qué mide el desvío estándar?',
      answer: 'Cuánto se alejan, en promedio, los datos de la media.',
    });
    monday.cards.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
    closeWorkspace(monday);
    const workspace = workspaceAt(folder, demoClock(7));
    workspace.cards.review({ cardId: card.id, grade: 'hard', attemptId: randomUUID() });
    const history = workspace.cards.history({ cardId: card.id });
    const copy = await workspace.createBackup('manual');

    workspace.cards.remove({ cardId: card.id });
    expect(workspace.trash.empty()).toEqual({ purged: 1 });
    expect(workspace.cards.list()).toEqual([]);

    await workspace.restoreBackup(copy.id);
    expect(workspace.cards.list().map((item) => item.question)).toEqual([
      '¿Qué mide el desvío estándar?',
    ]);
    expect(workspace.cards.history({ cardId: card.id })).toEqual(history);
    expect(history.entries.map(({ day, result }) => ({ day, result }))).toEqual([
      { day: '2027-03-15', result: 'good' },
      { day: '2027-03-22', result: 'hard' },
    ]);
    expect((await workspace.backups()).map((backup) => backup.kind)).toEqual([
      'before_restore',
      'manual',
    ]);
    expect(workspace.verifyData()).toEqual([]);
  });

  it('[CA-020] restaurar deja la base igual a la copia y guarda antes una copia «Antes de restaurar» del estado que tenía', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    const { a } = withData(workspace);
    const copy = await workspace.createBackup('manual');
    const atCopy = dumpTables(join(folder, 'retenia.db'), { except: ['ledger_state'] });

    // Una semana después de la copia: otro repaso y otra tarjeta.
    closeWorkspace(workspace);
    const later = workspaceAt(folder, demoClock(7));
    later.cards.review({ cardId: a.id, grade: 'again', attemptId: randomUUID() });
    later.cards.create({ question: 'Hecha después de la copia', answer: 'x' });
    const beforeRestore = dumpTables(join(folder, 'retenia.db'));
    const [{ last_seq: seqBefore } = {}] = readRows(
      join(folder, 'retenia.db'),
      'SELECT last_seq FROM ledger_state',
    );

    const { restored, safety } = await later.restoreBackup(copy.id);
    expect(restored.id).toBe(copy.id);
    expect(safety.kind).toBe('before_restore');
    expect(safety.day).toBe('2027-03-22');

    // La base es la de la copia (salvo el número de secuencia, que nunca vuelve para atrás).
    expect(dumpTables(join(folder, 'retenia.db'), { except: ['ledger_state'] })).toEqual(atCopy);
    expect(readRows(join(folder, 'retenia.db'), 'SELECT last_seq FROM ledger_state')).toEqual([
      { last_seq: seqBefore },
    ]);
    expect(later.cards.list().map((card) => card.question)).not.toContain(
      'Hecha después de la copia',
    );
    expect(later.verifyData()).toEqual([]);

    // Y lo que había antes de restaurar quedó entero en la copia «Antes de restaurar».
    const listed = await later.backups();
    expect(listed.map((backup) => backup.kind)).toEqual(['before_restore', 'manual']);
    const safetyFile = join(
      folder,
      'copias',
      copyFiles(folder).find((name) => name.includes('antes-de-restaurar')) ?? '',
    );
    expect(dumpTables(databaseOf(safetyFile, folder))).toEqual(beforeRestore);
  });

  it('[CA-020] si no puede guardar antes la copia del estado actual, no restaura nada', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    workspace.cards.create({ question: 'Después de la copia', answer: 'x' });
    const before = dumpTables(join(folder, 'retenia.db'));
    // La carpeta de trabajo ocupada por un archivo: no se puede preparar ninguna copia.
    rmSync(join(folder, 'tmp'), { recursive: true, force: true });
    writeFileSync(join(folder, 'tmp'), 'ocupado');

    await expect(workspace.restoreBackup(copy.id)).rejects.toThrow();
    expect(dumpTables(join(folder, 'retenia.db'))).toEqual(before);
    expect((await workspace.backups()).map((backup) => backup.kind)).toEqual(['manual']);
    expect(workspace.cards.list().map((card) => card.question)).toContain('Después de la copia');
  });

  it('[CA-020] si falla solo la copia «Antes de restaurar», no restaura nada aunque la copia elegida esté sana', async () => {
    const { folder } = dataFolder();
    let failSafety = false;
    const workspace = workspaceWithSteps(folder, (name) => {
      if (failSafety && name === 'verificada') {
        throw new Error('la copia previa no se pudo verificar');
      }
    });
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    workspace.cards.create({ question: 'Después de la copia', answer: 'x' });
    const before = dumpTables(join(folder, 'retenia.db'));

    failSafety = true;
    await expect(workspace.restoreBackup(copy.id)).rejects.toThrow(
      'la copia previa no se pudo verificar',
    );
    failSafety = false;
    expect(dumpTables(join(folder, 'retenia.db'))).toEqual(before);
    expect(copyFiles(folder)).toHaveLength(1);
    expect((await workspace.backups()).map((backup) => backup.kind)).toEqual(['manual']);
    expect(workspace.cards.list().map((card) => card.question)).toContain('Después de la copia');
  });

  it('[CA-020] si algo falla después de reemplazar el archivo, la restauración ya está hecha y Retenia sigue con la base restaurada', async () => {
    const { folder } = dataFolder();
    let failAfterReplacing = false;
    const workspace = workspaceWithSteps(folder, (name) => {
      if (failAfterReplacing && name === 'reemplazada') {
        throw new Error('falla después de reemplazar');
      }
    });
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    const atCopy = dumpTables(join(folder, 'retenia.db'), { except: ['ledger_state'] });
    workspace.cards.create({ question: 'Después de la copia', answer: 'x' });

    failAfterReplacing = true;
    const { restored } = await workspace.restoreBackup(copy.id);
    failAfterReplacing = false;
    expect(restored.id).toBe(copy.id);
    expect(dumpTables(join(folder, 'retenia.db'), { except: ['ledger_state'] })).toEqual(atCopy);
    expect(workspace.cards.list().map((card) => card.question)).not.toContain(
      'Después de la copia',
    );
    expect(workspace.verifyData()).toEqual([]);
  });

  it('si después de restaurar no puede volver a abrir la base, la abre en el pedido siguiente', async () => {
    const { folder } = dataFolder();
    const dbFile = join(folder, 'retenia.db');
    const aside = join(folder, 'retenia-aparte.db');
    let block = false;
    const workspace = workspaceWithSteps(folder, (name) => {
      if (block && name === 'reemplazada') {
        // Algo deja la base sin poder abrirse un momento: en su lugar queda una carpeta.
        renameSync(dbFile, aside);
        mkdirSync(dbFile);
      }
    });
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    workspace.cards.create({ question: 'Después de la copia', answer: 'x' });

    block = true;
    await workspace.restoreBackup(copy.id);
    block = false;
    expect(() => workspace.cards.list()).toThrow();
    rmSync(dbFile, { recursive: true });
    renameSync(aside, dbFile);
    expect(workspace.cards.list().map((card) => card.question)).not.toContain(
      'Después de la copia',
    );
    expect(workspace.verifyData()).toEqual([]);
  });

  it('restaurar una copia que no existe falla sin tocar nada', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    const before = dumpTables(join(folder, 'retenia.db'));
    await expect(workspace.restoreBackup(randomUUID())).rejects.toThrow();
    expect(dumpTables(join(folder, 'retenia.db'))).toEqual(before);
    expect(copyFiles(folder)).toEqual([]);
  });

  it('después de restaurar, el número de secuencia sigue creciendo: nunca se repite', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    const { a } = withData(workspace);
    const copy = await workspace.createBackup('manual');
    for (let index = 0; index < 5; index++) {
      workspace.cards.review({ cardId: a.id, grade: 'good', attemptId: randomUUID() });
    }
    const [{ last_seq: highest } = {}] = readRows(
      join(folder, 'retenia.db'),
      'SELECT last_seq FROM ledger_state',
    );
    await workspace.restoreBackup(copy.id);
    workspace.cards.review({ cardId: a.id, grade: 'good', attemptId: randomUUID() });
    const seqs = readRows(
      join(folder, 'retenia.db'),
      'SELECT seq FROM observations ORDER BY seq DESC LIMIT 1',
    );
    expect(Number(seqs[0]?.seq)).toBeGreaterThan(Number(highest));
  });
});

describe('copia automática al abrir', () => {
  const start = inBuenosAires('15/03/2027 10:00').getTime();
  const at = (hours: number) => fixedClock(new Date(start + hours * HOUR_MS));

  it('[CA-021] sin ninguna copia hace una; con la última de hace 25 horas, al abrir hace una sola', async () => {
    const { folder } = dataFolder();
    const first = workspaceAt(folder, at(0));
    expect(await first.ensureAutomaticBackup()).toMatchObject({ kind: 'auto', day: '2027-03-15' });
    expect(await first.ensureAutomaticBackup()).toBeNull();
    closeWorkspace(first);

    const tomorrow = workspaceAt(folder, at(25));
    expect(await tomorrow.ensureAutomaticBackup()).toMatchObject({
      kind: 'auto',
      day: '2027-03-16',
    });
    expect(await tomorrow.ensureAutomaticBackup()).toBeNull();
    expect(copyFiles(folder)).toHaveLength(2);
  });

  it('[CA-021] con 15 copias automáticas se conservan las 14 más nuevas, y la hecha a mano queda', async () => {
    const { folder } = dataFolder();
    const manual = workspaceAt(folder, at(-24));
    await manual.createBackup('manual');
    closeWorkspace(manual);
    for (let day = 0; day < 15; day++) {
      const workspace = workspaceAt(folder, at(day * 24));
      expect(await workspace.ensureAutomaticBackup(), `día ${day}`).not.toBeNull();
      closeWorkspace(workspace);
    }
    const last = workspaceAt(folder, at(15 * 24 - 1));
    const listed = await last.backups();
    const automatic = listed.filter((backup) => backup.kind === 'auto');
    expect(automatic).toHaveLength(14);
    expect(automatic.at(-1)?.day).toBe('2027-03-16');
    expect(listed.filter((backup) => backup.kind === 'manual')).toHaveLength(1);
  });

  it('[CA-021] una copia con fecha futura (el reloj volvió atrás) no frena la copia automática', async () => {
    const { folder } = dataFolder();
    // «+35 días», cerrar y abrir: la automática del 19/04/2027.
    const ahead = workspaceAt(folder, at(35 * 24));
    expect(await ahead.ensureAutomaticBackup()).toMatchObject({ kind: 'auto', day: '2027-04-19' });
    closeWorkspace(ahead);
    // «Restablecer fecha», «+1 día», cerrar y abrir: la del 16/03/2027, y una sola.
    const back = workspaceAt(folder, at(24));
    expect(await back.ensureAutomaticBackup()).toMatchObject({ kind: 'auto', day: '2027-03-16' });
    expect(await back.ensureAutomaticBackup()).toBeNull();
  });

  it('[CA-021] con 14 automáticas de fecha futura, la de hoy se hace y queda en la lista', async () => {
    const { folder } = dataFolder();
    for (let day = 0; day < 14; day++) {
      const ahead = workspaceAt(folder, at((100 + day) * 24));
      expect(await ahead.ensureAutomaticBackup(), `día ${day}`).not.toBeNull();
      closeWorkspace(ahead);
    }
    const today = workspaceAt(folder, at(0));
    const created = await today.ensureAutomaticBackup();
    expect(created).toMatchObject({ kind: 'auto', day: '2027-03-15' });
    const listed = await today.backups();
    expect(listed.map((backup) => backup.id)).toContain(created?.id);
    expect(listed.filter((backup) => backup.kind === 'auto')).toHaveLength(14);
  });
});

describe('restos de una copia o una restauración cortadas', () => {
  it('al abrir se limpian los archivos a medio hacer y la base queda como estaba', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    await workspace.createBackup('manual');
    closeWorkspace(workspace);
    mkdirSync(join(folder, 'tmp'), { recursive: true });
    writeFileSync(join(folder, 'tmp', 'restaurar-a-medias.db'), 'a medias');
    writeFileSync(
      join(folder, 'copias', '2027-03-15-1000-hecha-por-vos-0000abcd.retenia-copia.tmp'),
      'x',
    );

    const reopened = workspaceAt(folder);
    expect(readdirSync(join(folder, 'tmp'))).toEqual([]);
    expect(readdirSync(join(folder, 'copias')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(await reopened.backups()).toHaveLength(1);
    expect(reopened.cards.list()).toHaveLength(3);
    expect(reopened.verifyData()).toEqual([]);
  });

  it('un resto de una copia cortada que Windows tiene tomado no impide abrir Retenia', async () => {
    const { folder } = dataFolder();
    closeWorkspace(workspaceAt(folder));
    mkdirSync(join(folder, 'tmp'), { recursive: true });
    const leftover = join(folder, 'tmp', 'copia-cortada.db');
    writeFileSync(leftover, 'a medias');
    const held = holdFile(leftover);
    try {
      const reopened = workspaceAt(folder);
      expect(reopened.cards.list()).toEqual([]);
      expect(await reopened.createBackup('manual')).toMatchObject({ kind: 'manual' });
      closeWorkspace(reopened);
    } finally {
      held.release();
    }
  });

  it('si la carpeta de trabajo es un enlace a otra carpeta, al abrir se saca el enlace y lo de la otra carpeta no se toca', () => {
    const { folder } = dataFolder();
    const { folder: elsewhere } = dataFolder();
    const precious = join(elsewhere, 'importante.txt');
    writeFileSync(precious, 'no se toca');
    closeWorkspace(workspaceAt(folder));
    rmSync(join(folder, 'tmp'), { recursive: true, force: true });
    symlinkSync(elsewhere, join(folder, 'tmp'), 'junction');

    const reopened = workspaceAt(folder);
    expect(readFileSync(precious, 'utf8')).toBe('no se toca');
    expect(lstatSync(join(folder, 'tmp')).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(folder, 'tmp')).isDirectory()).toBe(true);
    expect(reopened.cards.list()).toEqual([]);
  });

  it('al abrir solo se borran los restos de Retenia en la carpeta de copias', () => {
    const { folder } = dataFolder();
    closeWorkspace(workspaceAt(folder));
    mkdirSync(join(folder, 'copias'), { recursive: true });
    writeFileSync(join(folder, 'copias', 'otro-programa.tmp'), 'ajeno');
    workspaceAt(folder);
    expect(readdirSync(join(folder, 'copias'))).toEqual(['otro-programa.tmp']);
  });

  it('restaurar no deja archivos de trabajo a medias y la base queda sana', async () => {
    const { folder } = dataFolder();
    const workspace = workspaceAt(folder);
    withData(workspace);
    const copy = await workspace.createBackup('manual');
    await workspace.restoreBackup(copy.id);
    expect(readdirSync(join(folder, 'tmp'))).toEqual([]);
    expect(readdirSync(join(folder, 'copias')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(workspace.integrityCheck()).toBe('ok');
    closeWorkspace(workspace);
    const raw = new Database(join(folder, 'retenia.db'), { readonly: true });
    expect(raw.pragma('integrity_check', { simple: true })).toBe('ok');
    raw.close();
  });
});
