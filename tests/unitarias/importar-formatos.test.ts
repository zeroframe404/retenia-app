import { describe, expect, it } from 'vitest';
import {
  type AnkiCollection,
  ankiHtmlToNodes,
  buildAnkiPackage,
  renderAnkiSide,
} from '../../src/core/imports/anki';
import { decodeEntities, htmlToPlain, removeDangerous, tidy } from '../../src/core/imports/html';
import { noteMarkdown, safeFileName } from '../../src/core/imports/markdown';
import { mediaInfo } from '../../src/core/imports/media';
import { baseName, excerpt, type PackageMedia } from '../../src/core/imports/package';
import { planImport } from '../../src/core/imports/plan';
import { decodeProto, ProtobufError } from '../../src/core/imports/protobuf';
import { buildRemnotePackage } from '../../src/core/imports/remnote';

// Los detalles de los formatos ajenos (H-29, H-30): cómo se reconoce un medio por sus bytes, el HTML
// que se cuela, el protobuf raro, las variantes del Markdown de RemNote y las de las plantillas de
// Anki, y el Markdown de «Exportar todo». Todo puro, sin disco.

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe('los medios, por sus primeros bytes', () => {
  it('[CA-122] PNG, GIF, JPEG y WebP dan su tamaño', () => {
    const png = new Uint8Array(30);
    png.set([0x89, ...ascii('PNG')], 0);
    png.set([0, 0, 0, 60, 0, 0, 0, 36], 16);
    expect(mediaInfo(png)).toEqual({ kind: 'image', mime: 'image/png', width: 60, height: 36 });
    expect(mediaInfo(bytes(...ascii('GIF89a'), 10, 0, 20, 0))).toEqual({
      kind: 'image',
      mime: 'image/gif',
      width: 10,
      height: 20,
    });
    // Un JPEG: SOI, un APP0 de 16 bytes y el SOF0 con alto 40 y ancho 30.
    const jpeg = bytes(
      0xff,
      0xd8,
      0xff,
      0xe0,
      0,
      16,
      ...new Array(14).fill(0),
      0xff,
      0xc0,
      0,
      17,
      8,
      0,
      40,
      0,
      30,
      3,
      0,
      0,
      0,
    );
    expect(mediaInfo(jpeg)).toEqual({ kind: 'image', mime: 'image/jpeg', width: 30, height: 40 });
    const webp = (chunk: string, size: number[]) => {
      const data = new Uint8Array(40);
      data.set(ascii('RIFF'), 0);
      data.set(ascii('WEBP'), 8);
      data.set(ascii(chunk), 12);
      data.set(size, 21);
      return data;
    };
    const lossy = webp('VP8 ', []);
    lossy.set([12, 0, 8, 0], 26);
    expect(mediaInfo(lossy)).toEqual({ kind: 'image', mime: 'image/webp', width: 12, height: 8 });
    expect(mediaInfo(webp('VP8L', [9, 0x40, 0x03, 0]))).toEqual({
      kind: 'image',
      mime: 'image/webp',
      width: 10,
      height: 14,
    });
    const extended = webp('VP8X', []);
    extended.set([4, 0, 0, 6, 0, 0], 24);
    expect(mediaInfo(extended)).toEqual({ kind: 'image', mime: 'image/webp', width: 5, height: 7 });
  });

  it('[CA-122] una imagen rota o de tamaño imposible no es una imagen que se muestre', () => {
    expect(mediaInfo(bytes(0xff, 0xd8, 0xff, 0x00, 0x00)).kind).toBe('other');
    expect(mediaInfo(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 1, ...new Array(10).fill(0))).kind).toBe(
      'other',
    );
    expect(mediaInfo(bytes(...ascii('GIF89a'), 0, 0, 0, 0)).kind).toBe('other');
    const webp = new Uint8Array(40);
    webp.set(ascii('RIFF'), 0);
    webp.set(ascii('WEBP'), 8);
    webp.set(ascii('ABCD'), 12);
    expect(mediaInfo(webp).kind).toBe('other');
  });

  it('[CA-122] los audios comunes se reconocen y lo demás es otra cosa', () => {
    expect(mediaInfo(bytes(...ascii('ID3'), 3)).mime).toBe('audio/mpeg');
    expect(mediaInfo(bytes(0xff, 0xfb, 0x90)).mime).toBe('audio/mpeg');
    expect(mediaInfo(bytes(...ascii('OggS'))).mime).toBe('audio/ogg');
    expect(mediaInfo(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'))).mime).toBe('audio/wav');
    expect(mediaInfo(bytes(...ascii('fLaC'))).mime).toBe('audio/flac');
    expect(mediaInfo(bytes(0, 0, 0, 0, ...ascii('ftyp'))).mime).toBe('audio/mp4');
    expect(mediaInfo(bytes(0x1a, 0x45, 0xdf, 0xa3)).mime).toBe('audio/webm');
    expect(mediaInfo(bytes(...ascii('%PDF-1.7')))).toEqual({
      kind: 'other',
      mime: 'application/octet-stream',
    });
  });
});

describe('el HTML que se cuela', () => {
  it('[CA-122] las entidades con número, las desconocidas y las imposibles', () => {
    expect(decodeEntities('&#225;&#xE9;&laquo;x&raquo; &foo; &#0; &#xD800; &#99999999;')).toBe(
      'áé«x» &foo;   &#99999999;',
    );
  });

  it('[CA-122] lo peligroso se va aunque falte su cierre, y los comentarios también', () => {
    expect(removeDangerous('a<!-- oculto -->b<script>c')).toBe('ab ');
    expect(htmlToPlain('<p>uno</p><p>dos</p><img src="x">y<')).toBe('uno\ndos\ny');
    expect(tidy('a  \t b \n\n\n c')).toBe('a b\nc');
  });

  it('[CA-122] los textos cortos para la lista y los nombres sin carpeta', () => {
    expect(excerpt('  mucho   espacio  ')).toBe('mucho espacio');
    expect(excerpt('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(baseName('a/b\\c.png')).toBe('c.png');
  });
});

describe('protobuf raro', () => {
  it('[CA-122] los campos de 32 y 64 bits se saltean y un tipo desconocido es un error', () => {
    const message = decodeProto(
      bytes((1 << 3) | 1, ...new Array(8).fill(0), (2 << 3) | 5, 1, 2, 3, 4, (3 << 3) | 0, 7),
    );
    expect(message.varint(3)).toBe(7n);
    expect(message.varint(9)).toBeNull();
    expect(message.bytes(9)).toBeNull();
    expect(message.string(9)).toBe('');
    expect(() => decodeProto(bytes((1 << 3) | 3))).toThrow(ProtobufError);
    expect(() => decodeProto(bytes(0))).toThrow(ProtobufError);
    expect(() => decodeProto(bytes(...new Array(11).fill(0xff)))).toThrow(ProtobufError);
    expect(() => decodeProto(bytes((1 << 3) | 2, 0x80, 0x80, 0x80, 0x80, 0x01))).toThrow(
      ProtobufError,
    );
    expect(() => decodeProto(bytes((1 << 3) | 2, 2, 0xff, 0xfe)).string(1)).toThrow(ProtobufError);
  });
});

const media = (entries: Record<string, Partial<PackageMedia>>) =>
  new Map(
    Object.entries(entries).map(([name, item]) => [
      name,
      {
        sha: 'c'.repeat(64),
        name,
        mime: 'image/png',
        bytes: 1,
        kind: 'image' as const,
        width: 2,
        height: 3,
        ...item,
      },
    ]),
  );

describe('variantes del Markdown de RemNote', () => {
  const blocks = (text: string, extra = new Map<string, PackageMedia>()) =>
    buildRemnotePackage([{ path: 'A/B/Nota.md', text }], extra);

  it('[CA-123] listas numeradas, citas, bloques de código y separadores', () => {
    const pkg = blocks('1. uno\n   2) dos\n> cita\n```\ncodigo >> x\n```\n---\n﻿');
    expect(pkg.notes[0]?.topic).toBe('A › B');
    expect(pkg.notes[0]?.blocks.map((block) => block.content)).toEqual([
      [{ type: 'text', text: 'uno' }],
      [{ type: 'text', text: 'dos' }],
      [{ type: 'text', text: 'cita' }],
      // El código entra como texto común, sin tarjeta (objeción 3 del revisor): con el separador
      // invisible entre los dos «>».
      [{ type: 'text', text: `codigo >${String.fromCharCode(0x2060)}> x` }],
    ]);
  });

  it('[CA-123] las marcas, los enlaces comunes, las entidades y los escapes', () => {
    const [block] =
      blocks('- __a__ ~~b~~ `c` [d](https://x) &amp; \\* *e* {{ }}\n').notes[0]?.blocks ?? [];
    expect(block?.content).toEqual([{ type: 'text', text: 'a b c d & * e {{ }}' }]);
  });

  it('[CA-123] «;<>» es de ida y vuelta, «:>» de ida, y una marca con un lado vacío se anota', () => {
    expect(blocks('- a ;<> b\n').notes[0]?.blocks[0]?.inverse).toBe(true);
    expect(blocks('- a :> b\n').notes[0]?.blocks[0]?.content).toEqual([
      { type: 'text', text: 'a >> b' },
    ]);
    const empty = blocks('- Pregunta >>\n');
    expect(empty.annotated).toEqual([{ what: 'Pregunta >>', note: 'plainText' }]);
    expect(planImport(empty, new Set()).cards.fresh).toBe(0);
  });

  it('[CA-123] imágenes por ruta codificada, por nombre único, fuera de la carpeta, de datos y en otro formato', () => {
    const found = media({
      'A/B/files/foto 1.png': {},
      'otra/unica.png': {},
      'A/B/files/raro.bmp': { kind: 'image', width: undefined, height: undefined },
    });
    const pkg = blocks(
      '- ![](files/foto%201.png)\n- ![](unica.png)\n- ![](../../../afuera.png)\n- ![](data:image/png;base64,xx)\n- ![](files/raro.bmp "título")\n- ![x](%E0%A4%A.png)\n',
      found,
    );
    expect(pkg.notes[0]?.blocks.map((block) => block.content[0]?.type ?? null)).toEqual([
      'image',
      'image',
      null,
      null,
      null,
      null,
    ]);
    expect(pkg.rejected.map((item) => item.reason)).toEqual([
      'missingImage',
      'onlineImage',
      'unsupportedImage',
      'missingImage',
    ]);
  });

  it('[CA-123] un enlace con alias y uno a una ruta con carpeta', () => {
    const pkg = buildRemnotePackage(
      [
        { path: 'X/Uno.md', text: '- [[Dos|el dos]] y [[X/Uno]]\n' },
        { path: 'Dos.md', text: '- hola\n' },
      ],
      new Map(),
    );
    expect(pkg.notes[0]?.blocks[0]?.content).toEqual([
      { type: 'link', target: 'remnote:Dos.md', label: 'Dos' },
      { type: 'text', text: ' y ' },
      { type: 'link', target: 'remnote:X/Uno.md', label: 'Uno' },
    ]);
  });
});

describe('variantes de las plantillas de Anki', () => {
  it('[CA-122] los campos especiales, los filtros de pista y un campo que no existe', () => {
    const fields = { F: 'valor' };
    expect(
      renderAnkiSide('{{Tags}}{{Deck}}{{hint:F}}{{No existe}}', fields, 'question', 0, false),
    ).toBe('valor');
    expect(renderAnkiSide('{{cloze:F}}', { F: 'sin cloze' }, 'question', 0, false)).toBe(
      'sin cloze',
    );
    expect(renderAnkiSide('{{F}}', fields, 'answer', 0, true)).toBe('');
    expect(renderAnkiSide('{{image-occlusion:F}}x', fields, 'question', 0, false)).toBe('x');
  });

  it('[CA-122] una imagen con nombre codificado, una que no es imagen y un audio que falta', () => {
    const found = media({
      'a b.png': {},
      'doc.pdf': { kind: 'image', width: undefined, height: undefined },
    });
    expect(
      ankiHtmlToNodes('<img src="a%20b.png"><img src=\'%E0%A4%A\'>', found).nodes,
    ).toHaveLength(1);
    expect(ankiHtmlToNodes('<img src="doc.pdf">', found).unsupported).toEqual(['doc.pdf']);
  });

  const collection = (): AnkiCollection => ({
    notetypes: [
      {
        id: 1,
        name: 'B',
        kind: 'normal',
        fields: ['F', 'B'],
        templates: [{ ord: 0, qfmt: '{{F}}', afmt: '{{B}}' }],
      },
    ],
    decks: [],
    notes: [
      {
        id: 1,
        guid: 'g',
        mid: 1,
        tags: [],
        fields: ['¿Q? [latex]x[/latex]', 'R [sound:falta.mp3] <img src="doc.pdf">'],
      },
    ],
    cards: [
      { id: 10, nid: 1, did: 5, odid: 0, ord: 0, queue: 0 },
      { id: 11, nid: 1, did: 5, odid: 0, ord: 3, queue: 0 },
      { id: 12, nid: 99, did: 5, odid: 0, ord: 0, queue: 0 },
    ],
    revlog: [],
  });

  it('[CA-122] una tarjeta sin plantilla se rechaza; el LaTeX se anota; el audio que falta y el formato raro se rechazan', () => {
    const pkg = buildAnkiPackage(
      collection(),
      media({ 'doc.pdf': { kind: 'image', width: undefined, height: undefined } }),
    );
    expect(pkg.cards).toHaveLength(1);
    expect(pkg.cards[0]?.topic).toBeNull();
    expect(pkg.annotated).toEqual([{ what: '¿Q? [latex]x[/latex]', note: 'latex' }]);
    expect(pkg.rejected.map((item) => item.reason).sort()).toEqual([
      'missingAudio',
      // La que no tiene plantilla y (objeción 5 del revisor) la que no tiene su nota.
      'unsupportedCard',
      'unsupportedCard',
      'unsupportedImage',
    ]);
  });

  it('[CA-122] una respuesta vacía es una tarjeta vacía', () => {
    const data = collection();
    const [note] = data.notes;
    if (note) {
      note.fields = ['¿Q?', ''];
    }
    data.cards = [{ id: 10, nid: 1, did: 5, odid: 0, ord: 0, queue: 0 }];
    expect(buildAnkiPackage(data, new Map()).rejected).toEqual([
      { what: '¿Q?', reason: 'emptyCard' },
    ]);
  });
});

describe('el Markdown de «Exportar todo»', () => {
  it('[CA-379] encabezado, renglones anidados, huecos, enlaces, imágenes y renglones con saltos', () => {
    const text = noteMarkdown(
      {
        id: 'n1',
        title: '',
        subject: 'Mate: básica',
        topic: null,
        createdAt: '2027-03-15T13:00:00.000Z',
        archived: true,
        blocks: [
          { id: 'b2', parentId: 'b1', position: 0, content: [{ type: 'cloze', text: 'hueco' }] },
          { id: 'b1', parentId: null, position: 0, content: [{ type: 'text', text: 'uno\ndos' }] },
          {
            id: 'b3',
            parentId: null,
            position: 1,
            content: [
              { type: 'mention', id: 'n2', label: 'Otra' },
              { type: 'image', sha: 's', alt: '[a]' },
            ],
          },
        ],
      },
      { depth: 2, extensionOf: () => 'png' },
    );
    expect(text).toBe(
      [
        '---',
        'id: n1',
        'materia: "Mate: básica"',
        'tema: Sin tema',
        'titulo: Sin título',
        'creada: 2027-03-15T13:00:00.000Z',
        'archivada: sí',
        '---',
        '- uno',
        '  dos',
        '\t- {{hueco}}',
        '- [[Otra]]{nota=n2}![a](../../imagenes/s.png)',
        '',
      ].join('\n'),
    );
  });

  it('[CA-127] los nombres de archivo que Windows no acepta se limpian', () => {
    expect(safeFileName('a/b:c*?', 'x')).toBe('a b c');
    expect(safeFileName('con', 'x')).toBe('x');
    expect(safeFileName('  ...  ', 'x')).toBe('x');
    expect(safeFileName(`uno${String.fromCharCode(1)}dos.`, 'x')).toBe('uno dos');
  });
});
