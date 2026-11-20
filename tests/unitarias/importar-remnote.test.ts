import { describe, expect, it } from 'vitest';
import type { PackageMedia } from '../../src/core/imports/package';
import { planImport } from '../../src/core/imports/plan';
import { buildRemnotePackage } from '../../src/core/imports/remnote';
import { demoRemnoteFiles } from '../../tools/datos-de-ejemplo/importaciones.mjs';

// El lector de la exportación en Markdown de RemNote (H-29): cada documento es una nota, los
// renglones conservan su jerarquía y las tarjetas escritas con «>>», «::» y huecos se reconocen. Lo
// que no se puede interpretar entra como texto común y se anota.

const SHIELD: PackageMedia = {
  sha: 'b'.repeat(64),
  name: 'escudo.png',
  mime: 'image/png',
  bytes: 90,
  kind: 'image',
  width: 40,
  height: 48,
};

const one = (text: string, media = new Map<string, PackageMedia>()) =>
  buildRemnotePackage([{ path: 'Tema/Nota.md', text }], media);

const blocksOf = (text: string) => one(text).notes[0]?.blocks ?? [];

describe('los documentos y sus renglones', () => {
  it('[CA-123] cada documento es una nota con su título, y su carpeta es el tema', () => {
    const pkg = buildRemnotePackage(
      [
        { path: 'Independencia/Güemes.md', text: '- Hola\n' },
        { path: 'Suelta.md', text: '- Chau\n' },
      ],
      new Map(),
    );
    expect(pkg.notes.map((note) => [note.title, note.topic, note.key])).toEqual([
      ['Güemes', 'Independencia', 'remnote:Independencia/Güemes.md'],
      ['Suelta', null, 'remnote:Suelta.md'],
    ]);
  });

  it('[CA-123] los renglones anidados conservan su jerarquía, con tabulaciones o con espacios', () => {
    for (const text of [
      '- a\n\t- b\n\t\t- c\n- d\n',
      '- a\n  - b\n    - c\n- d\n',
      '- a\n    - b\n        - c\n- d\n',
      '* a\n  * b\n    * c\n* d\n',
    ]) {
      const blocks = blocksOf(text);
      const parent = (key: string | null) => blocks.find((block) => block.key === key);
      expect(blocks.map((block) => block.content)).toEqual([
        [{ type: 'text', text: 'a' }],
        [{ type: 'text', text: 'b' }],
        [{ type: 'text', text: 'c' }],
        [{ type: 'text', text: 'd' }],
      ]);
      expect(blocks.map((block) => parent(block.parentKey)?.content[0])).toEqual([
        undefined,
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
        undefined,
      ]);
    }
  });

  it('[CA-123] los párrafos sueltos y los títulos también son renglones', () => {
    expect(blocksOf('# Título\n\nUn párrafo.\n').map((block) => block.content)).toEqual([
      [{ type: 'text', text: 'Título' }],
      [{ type: 'text', text: 'Un párrafo.' }],
    ]);
  });

  it('[CA-123] las marcas de negrita y cursiva se van; las fórmulas quedan entre signos $', () => {
    expect(blocksOf('- **Ojo** con _esto_ y $x^2$\n')[0]?.content).toEqual([
      { type: 'text', text: 'Ojo con esto y $x^2$' },
    ]);
  });
});

describe('las tarjetas', () => {
  it('[CA-123] «>>» y «==» son una tarjeta de ida', () => {
    for (const text of ['- ¿Año? >> 1816\n', '- ¿Año? == 1816\n', '- ¿Año? ;; 1816\n']) {
      const [block] = blocksOf(text);
      expect(block?.content).toEqual([{ type: 'text', text: '¿Año? >> 1816' }]);
      expect(block?.inverse).toBe(false);
    }
  });

  it('[CA-123] «::» y «<>» son de ida y vuelta', () => {
    for (const text of ['- Junta :: Gobierno de 1810\n', '- Junta <> Gobierno de 1810\n']) {
      const [block] = blocksOf(text);
      expect(block?.content).toEqual([{ type: 'text', text: 'Junta >> Gobierno de 1810' }]);
      expect(block?.inverse).toBe(true);
    }
  });

  it('[CA-123] «<<» es solo de vuelta', () => {
    const [block] = blocksOf('- Junta << Gobierno de 1810\n');
    expect(block?.content).toEqual([{ type: 'text', text: 'Gobierno de 1810 >> Junta' }]);
    expect(block?.inverse).toBe(false);
  });

  it('[CA-123] los huecos «{{…}}» son tarjetas de completar, una por hueco', () => {
    const [block] = blocksOf('- El {{9 de julio}} en {{Tucumán}}\n');
    expect(block?.content).toEqual([
      { type: 'text', text: 'El ' },
      { type: 'cloze', text: '9 de julio' },
      { type: 'text', text: ' en ' },
      { type: 'cloze', text: 'Tucumán' },
    ]);
    expect(planImport(one('- El {{9 de julio}} en {{Tucumán}}\n'), new Set()).cards.fresh).toBe(2);
  });

  it('[CA-123] lo que no se puede interpretar entra como texto común y se anota', () => {
    for (const text of ['- Miembros >>>\n', '- Junta >>- Gobierno\n', '- Elegí ==A) Saavedra\n']) {
      const pkg = one(text);
      expect(pkg.notes[0]?.blocks[0]?.content).toEqual([{ type: 'text', text: text.slice(2, -1) }]);
      expect(pkg.annotated).toEqual([{ what: text.slice(2, -1), note: 'plainText' }]);
      expect(planImport(pkg, new Set()).cards.fresh).toBe(0);
    }
  });
});

describe('imágenes y enlaces', () => {
  it('[CA-123] una imagen que vino en la exportación entra; una que falta se rechaza con su motivo', () => {
    const media = new Map([['Tema/files/escudo.png', SHIELD]]);
    const pkg = one('- ![Escudo](files/escudo.png)\n- ![Mapa](files/mapa.png)\n', media);
    expect(pkg.notes[0]?.blocks.map((block) => block.content)).toEqual([
      [{ type: 'image', sha: SHIELD.sha, width: 40, height: 48, alt: 'Escudo' }],
      [],
    ]);
    expect(pkg.rejected).toEqual([{ what: 'Nota: mapa.png', reason: 'missingImage' }]);
  });

  it('[CA-123] una imagen de internet no se baja: se rechaza con su motivo', () => {
    expect(one('- ![x](https://ejemplo.com/x.png)\n').rejected).toEqual([
      { what: 'Nota: x.png', reason: 'onlineImage' },
    ]);
  });

  it('[CA-123] un enlace a otro documento de la exportación queda como enlace; uno a otro lado, como texto', () => {
    const pkg = buildRemnotePackage(
      [
        { path: 'A.md', text: '- Ver [[B]] y [[Z]]\n' },
        { path: 'B.md', text: '- Hola\n' },
      ],
      new Map(),
    );
    expect(pkg.notes[0]?.blocks[0]?.content).toEqual([
      { type: 'text', text: 'Ver ' },
      { type: 'link', target: 'remnote:B.md', label: 'B' },
      { type: 'text', text: ' y Z' },
    ]);
    expect(pkg.annotated).toEqual([{ what: 'Z', note: 'unknownLink' }]);
  });

  it('[CA-123] el HTML de un documento es texto: los scripts no entran', () => {
    expect(blocksOf('- Hola <script>alert(1)</script>mundo\n')[0]?.content).toEqual([
      { type: 'text', text: 'Hola mundo' },
    ]);
  });
});

describe('remnote-demo.zip', () => {
  it('[CA-123] da 12 notas, 8 tarjetas y 1 rechazada por imagen faltante', () => {
    const docs = demoRemnoteFiles()
      .filter((file) => file.name.endsWith('.md'))
      .map((file) => ({ path: file.name, text: file.data.toString('utf8') }));
    const pkg = buildRemnotePackage(docs, new Map([['Independencia/files/escudo.png', SHIELD]]));
    const plan = planImport(pkg, new Set());
    expect(plan.notes).toEqual({ fresh: 12, existing: 0 });
    expect(plan.cards).toEqual({ fresh: 8, existing: 0 });
    expect(plan.rejected).toEqual([
      { what: 'Cruce de los Andes: mapa-del-cruce.png', reason: 'missingImage' },
    ]);
    expect(plan.withoutHistory).toBe(8);
    expect(pkg.annotated).toEqual([
      { what: 'Miembros de la Primera Junta >>>', note: 'plainText' },
    ]);
  });

  it('[CA-124] la segunda vez no entra nada: las 12 notas ya estaban', () => {
    const docs = demoRemnoteFiles()
      .filter((file) => file.name.endsWith('.md'))
      .map((file) => ({ path: file.name, text: file.data.toString('utf8') }));
    const pkg = buildRemnotePackage(docs, new Map());
    const plan = planImport(pkg, new Set(pkg.notes.map((note) => note.key)));
    expect(plan.notes).toEqual({ fresh: 0, existing: 12 });
    expect(plan.cards.fresh).toBe(0);
    expect(plan.rejected).toEqual([]);
  });
});
