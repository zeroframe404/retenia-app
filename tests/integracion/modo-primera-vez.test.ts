import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createDemoWorkspace } from '../../src/main/demo/switcher';
import { resetDemoData } from '../../tools/lib/datos.mjs';
import { tempDataFolder } from '../apoyo/base';
import { dumpTables } from '../apoyo/base-cruda';

// «Empezar como la primera vez» y «Volver al elenco» (Ajustes › «Demostración»): la demostración
// se abre sobre una segunda carpeta de datos, vacía, sin tocar el elenco. El modo queda anotado.

const folders: ReturnType<typeof tempDataFolder>[] = [];
const demos: ReturnType<typeof createDemoWorkspace>[] = [];
afterEach(() => {
  for (const demo of demos.splice(0)) {
    demo.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function dataDir() {
  const folder = tempDataFolder();
  folders.push(folder);
  return folder.folder;
}

function open(dir = dataDir()) {
  const demo = createDemoWorkspace({
    dataDir: dir,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
  });
  demos.push(demo);
  return { demo, dir };
}

describe('el modo elenco', () => {
  it('abre por defecto en el elenco: las tres tarjetas y las cuatro materias, en la carpeta de siempre', () => {
    const { demo, dir } = open();
    expect(demo.mode()).toBe('cast');
    expect(demo.workspace.cards.count()).toBe(3);
    expect(demo.workspace.subjects.count()).toBe(4);
    expect(existsSync(join(dir, 'retenia.db'))).toBe(true);
    expect(existsSync(join(dir, 'primera-vez'))).toBe(false);
  });

  it('el elenco se siembra una sola vez: abrir de nuevo no lo duplica', () => {
    const { demo, dir } = open();
    demo.close();
    const again = open(dir).demo;
    expect(again.workspace.subjects.count()).toBe(4);
    expect(again.workspace.cards.count()).toBe(3);
  });

  it('el espacio de trabajo expone la misma carpeta de datos en los dos modos', () => {
    const { demo, dir } = open();
    expect(demo.workspace.dataDir).toBe(dir);
  });
});

describe('«Empezar como la primera vez»', () => {
  it('[CA-041] abre una base vacía, sin materias ni tarjetas, en una carpeta aparte', async () => {
    const { demo, dir } = open();

    await expect(demo.useFirstTime()).resolves.toBe('first-time');

    expect(demo.mode()).toBe('first-time');
    expect(demo.workspace.subjects.count()).toBe(0);
    expect(demo.workspace.subjects.list()).toEqual({ subjects: [] });
    expect(demo.workspace.cards.count()).toBe(0);
    expect(demo.workspace.inbox.list()).toEqual({ items: [], count: 0 });
    expect(existsSync(join(dir, 'primera-vez', 'retenia.db'))).toBe(true);
  });

  it('[CA-041] ahí se puede escribir «Química orgánica»: queda activa, y el elenco no se entera', async () => {
    const { demo } = open();
    await demo.useFirstTime();

    const created = demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });

    expect(demo.workspace.subjects.list().subjects).toEqual([created]);
    await demo.useCast();
    expect(demo.workspace.subjects.list().subjects.map((subject) => subject.name)).toEqual([
      'Estadística básica',
      'Historia argentina',
      'Inglés',
      'Ejemplo',
    ]);
  });

  it('[CA-041] «Probar con un ejemplo (3 min)» en la primera vez carga «Ejemplo» y la deja activa', async () => {
    const { demo } = open();
    await demo.useFirstTime();
    const example = demo.workspace.subjects.createExample();
    expect(example).toMatchObject({ name: 'Ejemplo', status: 'active', isExample: true });
    expect(demo.workspace.subjects.count()).toBe(1);
  });

  it('volver al elenco no toca la base del elenco: queda idéntica, fila por fila', async () => {
    const { demo, dir } = open();
    const before = dumpTables(join(dir, 'retenia.db'));
    await demo.useFirstTime();
    demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    demo.workspace.cards.create({ question: 'P', answer: 'R' });
    await demo.useCast();
    expect(dumpTables(join(dir, 'retenia.db'))).toEqual(before);
  });

  it('lo escrito en la primera vez sigue ahí si se vuelve a esa carpeta', async () => {
    const { demo } = open();
    await demo.useFirstTime();
    demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    await demo.useCast();
    await demo.useFirstTime();
    expect(demo.workspace.subjects.list().subjects.map((subject) => subject.name)).toEqual([
      'Química orgánica',
    ]);
  });

  it('pedirlo estando ya en ese modo no cambia nada', async () => {
    const { demo } = open();
    await demo.useFirstTime();
    demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    await expect(demo.useFirstTime()).resolves.toBe('first-time');
    expect(demo.workspace.subjects.count()).toBe(1);
    await expect(demo.useCast()).resolves.toBe('cast');
    await expect(demo.useCast()).resolves.toBe('cast');
    expect(demo.workspace.subjects.count()).toBe(4);
  });

  it('cada modo tiene sus propias copias', async () => {
    const { demo, dir } = open();
    expect(demo.workspace.copiesDir).toBe(join(dir, 'copias'));
    await demo.useFirstTime();
    expect(demo.workspace.copiesDir).toBe(join(dir, 'primera-vez', 'copias'));
    await demo.workspace.createBackup('manual');
    expect(readdirSync(join(dir, 'primera-vez', 'copias'))).toHaveLength(1);
    expect(existsSync(join(dir, 'copias'))).toBe(false);
    await demo.useCast();
    expect((await demo.workspace.backups()).length).toBe(0);
  });

  it('un pedido en curso termina antes de cambiar de modo', async () => {
    const { demo, dir } = open();
    const backup = demo.workspace.createBackup('manual');
    const switching = demo.useFirstTime();
    await expect(backup).resolves.toMatchObject({ kind: 'manual' });
    await switching;
    expect(readdirSync(join(dir, 'copias'))).toHaveLength(1);
    expect(demo.mode()).toBe('first-time');
  });

  it('los pedidos que llegan mientras se cambia de modo esperan y caen en la base nueva', async () => {
    const { demo } = open();
    const backup = demo.workspace.createBackup('manual');
    const switching = demo.useFirstTime();
    const later = demo.workspace.backups();
    await Promise.all([backup, switching]);
    expect(await later).toEqual([]);
  });
});

describe('el modo queda anotado', () => {
  it('el modo se guarda en demo-modo.json y al abrir de nuevo sigue en la primera vez', async () => {
    const { demo, dir } = open();
    await demo.useFirstTime();
    expect(JSON.parse(readFileSync(join(dir, 'demo-modo.json'), 'utf8'))).toEqual({
      mode: 'first-time',
    });
    demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    demo.close();

    const again = open(dir).demo;

    expect(again.mode()).toBe('first-time');
    expect(again.workspace.subjects.list().subjects.map((subject) => subject.name)).toEqual([
      'Química orgánica',
    ]);
  });

  it('volver al elenco también queda anotado', async () => {
    const { demo, dir } = open();
    await demo.useFirstTime();
    await demo.useCast();
    expect(JSON.parse(readFileSync(join(dir, 'demo-modo.json'), 'utf8'))).toEqual({ mode: 'cast' });
    demo.close();
    expect(open(dir).demo.mode()).toBe('cast');
  });

  it('si el archivo falta, está roto o dice otra cosa, abre en el elenco', () => {
    for (const content of [
      null,
      '{ esto no es JSON',
      '[]',
      '{"mode":"otro"}',
      '{"mode":1}',
      '{}',
    ]) {
      const dir = dataDir();
      if (content !== null) {
        writeFileSync(join(dir, 'demo-modo.json'), content);
      }
      const { demo } = open(dir);
      expect(demo.mode(), String(content)).toBe('cast');
      expect(demo.workspace.subjects.count()).toBe(4);
      demo.close();
    }
  });

  it('el archivo no deja temporales y no pisa lo demás de la carpeta', async () => {
    const { demo, dir } = open();
    await demo.useFirstTime();
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(existsSync(join(dir, 'retenia.db'))).toBe(true);
  });
});

describe('cerrar', () => {
  it('cerrar cierra la base del modo en uso', () => {
    const { demo } = open();
    demo.close();
    expect(() => demo.workspace.cards.list()).toThrow();
  });

  it('cerrar dos veces no falla', () => {
    const { demo } = open();
    demo.close();
    expect(() => demo.close()).not.toThrow();
  });
});

describe('«datos:reiniciar»', () => {
  it('borra toda la carpeta de la demostración, también la de la primera vez y el modo anotado', async () => {
    const dir = dataDir();
    resetDemoData(dir);
    const { demo } = open(dir);
    await demo.useFirstTime();
    demo.workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    demo.close();
    expect(existsSync(join(dir, 'primera-vez', 'retenia.db'))).toBe(true);

    resetDemoData(dir);

    expect(readdirSync(dir)).toEqual(['LEEME.txt']);
    const reopened = open(dir).demo;
    expect(reopened.mode()).toBe('cast');
    expect(reopened.workspace.subjects.count()).toBe(4);
  });
});
