import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageNotFoundError, InvalidImageError } from '../../src/data/organization-errors';
import { imagesReadResponse, imagesSaveResponse } from '../../src/preload/contract/notes';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace, pngBytes } from '../apoyo/espacio';

// Imágenes (CA-372): se guardan en la carpeta de datos por su huella SHA-256, se comprueba que el
// contenido sea del tipo que dice y la misma imagen pegada dos veces es una sola.

afterEach(closeSpaces);

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const padded = (head: number[]) => new Uint8Array([...head, ...new Array(24).fill(7)]);

describe('guardar una imagen', () => {
  it('[CA-372] queda en «imagenes» de la carpeta de datos con su huella como nombre', () => {
    const { workspace, dataDir } = openSpace();
    const bytes = pngBytes();

    const saved = workspace.images.save({ bytes, mime: 'image/png', width: 1, height: 1 });

    expect(saved).toEqual({ sha: sha256(bytes) });
    expect(imagesSaveResponse.safeParse(saved).success).toBe(true);
    const file = join(dataDir, 'imagenes', sha256(bytes));
    expect(existsSync(file)).toBe(true);
    expect(new Uint8Array(readFileSync(file))).toEqual(bytes);
    expect(readdirSync(join(dataDir, 'imagenes'))).toEqual([sha256(bytes)]);
  });

  it('[CA-372] sigue ahí, con los mismos bytes, al cerrar y abrir', () => {
    const space = openSpace();
    const bytes = pngBytes();
    const { sha } = space.workspace.images.save({ bytes, mime: 'image/png', width: 1, height: 1 });

    const reopened = space.reopen();
    const read = reopened.images.read({ sha });

    expect(read.mime).toBe('image/png');
    expect(new Uint8Array(read.bytes)).toEqual(bytes);
    expect(imagesReadResponse.safeParse(read).success).toBe(true);
  });

  it('[CA-372] una nota con una imagen la guarda y la conserva al cerrar y abrir', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    });
    const note = space.workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { sha } = space.workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    const image = { type: 'image' as const, sha, width: 1, height: 1, alt: 'Curva normal' };
    space.workspace.notes.save({
      noteId: note.id,
      title: '',
      blocks: [
        { id: note.blocks[0]?.id ?? '', parentId: null, collapsed: false, content: [image] },
      ],
    });

    const reopened = space.reopen();

    expect(reopened.notes.get({ noteId: note.id }).blocks[0]?.content).toEqual([image]);
    expect(reopened.images.read({ sha }).bytes).toHaveLength(pngBytes().length);
  });

  it('pegar la misma imagen dos veces es una sola: una fila, un archivo, la misma huella', () => {
    const { workspace, dataDir, file } = openSpace();
    const first = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    const second = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    expect(second).toEqual(first);
    expect(readRows(file, 'SELECT count(*) AS n FROM images')).toEqual([{ n: 1 }]);
    expect(readdirSync(join(dataDir, 'imagenes'))).toHaveLength(1);
  });

  it('dos imágenes distintas son dos archivos', () => {
    const { workspace, dataDir } = openSpace();
    const first = workspace.images.save({
      bytes: pngBytes(0),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    const second = workspace.images.save({
      bytes: pngBytes(1),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    expect(second.sha).not.toBe(first.sha);
    expect(readdirSync(join(dataDir, 'imagenes')).sort()).toEqual([first.sha, second.sha].sort());
  });

  it('la fila guarda el tipo, el tamaño en bytes y las medidas', () => {
    const { workspace, file } = openSpace();
    const bytes = pngBytes();
    const { sha } = workspace.images.save({ bytes, mime: 'image/png', width: 320, height: 200 });
    expect(readRows(file, 'SELECT sha256, mime, bytes, width, height FROM images')).toEqual([
      { sha256: sha, mime: 'image/png', bytes: bytes.length, width: 320, height: 200 },
    ]);
  });

  it('no deja archivos temporales en la carpeta de imágenes', () => {
    const { workspace, dataDir } = openSpace();
    workspace.images.save({ bytes: pngBytes(), mime: 'image/png', width: 1, height: 1 });
    expect(readdirSync(join(dataDir, 'imagenes')).filter((name) => name.endsWith('.tmp'))).toEqual(
      [],
    );
  });

  it('si el archivo se perdió pero la fila sigue, pegarla de nuevo lo vuelve a escribir', () => {
    const { workspace, dataDir } = openSpace();
    const bytes = pngBytes();
    const { sha } = workspace.images.save({ bytes, mime: 'image/png', width: 1, height: 1 });
    rmSync(join(dataDir, 'imagenes', sha));
    workspace.images.save({ bytes, mime: 'image/png', width: 1, height: 1 });
    expect(new Uint8Array(readFileSync(join(dataDir, 'imagenes', sha)))).toEqual(bytes);
  });
});

describe('qué se acepta como imagen', () => {
  it('acepta PNG, JPEG, GIF (87a y 89a) y WebP con sus primeros bytes verdaderos', () => {
    const { workspace } = openSpace();
    const riff = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')];
    const accepted = [
      ['image/png', pngBytes()],
      ['image/jpeg', padded([0xff, 0xd8, 0xff, 0xe0])],
      ['image/gif', padded(ascii('GIF87a'))],
      ['image/gif', padded(ascii('GIF89a'))],
      ['image/webp', padded(riff)],
    ] as const;
    for (const [mime, bytes] of accepted) {
      expect(workspace.images.save({ bytes, mime, width: 1, height: 1 }).sha).toBe(sha256(bytes));
    }
  });

  it('[CA-372] un archivo que dice ser PNG y no lo es se rechaza y no se guarda nada', () => {
    const { workspace, dataDir, file } = openSpace();
    const fakes = [
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      new TextEncoder().encode('MZ ejecutable disfrazado'),
      padded([0xff, 0xd8, 0xff, 0xe0]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ];
    for (const bytes of fakes) {
      expect(() =>
        workspace.images.save({ bytes, mime: 'image/png', width: 1, height: 1 }),
      ).toThrow(InvalidImageError);
    }
    expect(readRows(file, 'SELECT count(*) AS n FROM images')).toEqual([{ n: 0 }]);
    expect(
      existsSync(join(dataDir, 'imagenes')) ? readdirSync(join(dataDir, 'imagenes')) : [],
    ).toEqual([]);
  });

  it('un tipo que no coincide con el contenido se rechaza para cada tipo', () => {
    const { workspace } = openSpace();
    const riffNotWebp = padded([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]);
    for (const [mime, bytes] of [
      ['image/jpeg', pngBytes()],
      ['image/gif', pngBytes()],
      ['image/webp', pngBytes()],
      ['image/webp', riffNotWebp],
      ['image/gif', padded(ascii('GIF90a'))],
    ] as const) {
      expect(() => workspace.images.save({ bytes, mime, width: 1, height: 1 })).toThrow(
        InvalidImageError,
      );
    }
  });
});

describe('leer una imagen', () => {
  it('una huella que no se guardó es un error', () => {
    const { workspace } = openSpace();
    expect(() => workspace.images.read({ sha: 'a'.repeat(64) })).toThrow(ImageNotFoundError);
  });

  it('si el archivo no está, es un error aunque la fila exista', () => {
    const { workspace, dataDir } = openSpace();
    const { sha } = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    rmSync(join(dataDir, 'imagenes', sha));
    expect(() => workspace.images.read({ sha })).toThrow(ImageNotFoundError);
  });

  it('no sale de la carpeta de imágenes aunque la huella sea un camino', () => {
    const { workspace } = openSpace();
    expect(() => workspace.images.read({ sha: '../retenia.db' })).toThrow(ImageNotFoundError);
  });

  it('guardar un renglón con una imagen de otra huella falla, y con la huella guardada anda', () => {
    const { workspace } = openSpace();
    const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    const { sha } = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    const withImage = (hash: string) => [
      {
        ...line('', { id: note.blocks[0]?.id }),
        content: [{ type: 'image' as const, sha: hash, width: 1, height: 1, alt: '' }],
      },
    ];
    expect(() =>
      workspace.notes.save({ noteId: note.id, title: '', blocks: withImage('b'.repeat(64)) }),
    ).toThrow(ImageNotFoundError);
    expect(() =>
      workspace.notes.save({ noteId: note.id, title: '', blocks: withImage(sha) }),
    ).not.toThrow();
  });
});
