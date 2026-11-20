import { describe, expect, it } from 'vitest';
import {
  type AnkiCollection,
  ankiHtmlToNodes,
  buildAnkiPackage,
  countsAsReview,
  gradeOfAnkiEase,
  renderAnkiSide,
} from '../../src/core/imports/anki';
import type { PackageMedia } from '../../src/core/imports/package';
import { planImport } from '../../src/core/imports/plan';

// Las reglas puras de la importación de Anki (H-29): cómo se traducen sus botones, qué entradas del
// historial son repasos, cómo se arma la pregunta y la respuesta desde las plantillas y cómo su HTML
// pasa a ser contenido de Retenia (el contenido es dato, nunca instrucción).

const SHA = 'a'.repeat(64);
const FLAG: PackageMedia = {
  sha: SHA,
  name: 'bandera.png',
  mime: 'image/png',
  bytes: 120,
  kind: 'image',
  width: 60,
  height: 36,
};
const media = new Map([['bandera.png', FLAG]]);

describe('los botones de Anki', () => {
  it('[CA-122] 1 es «No la sabía», 2 es «Con dudas», 3 y 4 son «La sabía»', () => {
    expect(gradeOfAnkiEase(1)).toBe('again');
    expect(gradeOfAnkiEase(2)).toBe('hard');
    expect(gradeOfAnkiEase(3)).toBe('good');
    expect(gradeOfAnkiEase(4)).toBe('good');
  });

  it('[CA-122] el botón 0 (reprogramar a mano) y uno desconocido no son una calificación', () => {
    expect(gradeOfAnkiEase(0)).toBeNull();
    expect(gradeOfAnkiEase(5)).toBeNull();
    expect(gradeOfAnkiEase(-1)).toBeNull();
  });

  it('[CA-122] cuentan los repasos de aprendizaje, repaso, reaprendizaje y mazo filtrado; no las reprogramaciones', () => {
    for (const type of [0, 1, 2, 3]) {
      expect(countsAsReview({ type, ease: 3 })).toBe(true);
    }
    expect(countsAsReview({ type: 4, ease: 0 })).toBe(false);
    expect(countsAsReview({ type: 4, ease: 3 })).toBe(false);
    expect(countsAsReview({ type: 5, ease: 0 })).toBe(false);
    expect(countsAsReview({ type: 1, ease: 0 })).toBe(false);
  });
});

describe('las plantillas de Anki', () => {
  const fields = { Anverso: '¿Capital de Francia?', Reverso: 'París', Extra: '' };

  it('[CA-122] la pregunta y la respuesta de una nota básica', () => {
    expect(renderAnkiSide('{{Anverso}}', fields, 'question', 0, false)).toBe(
      '¿Capital de Francia?',
    );
    expect(
      renderAnkiSide('{{FrontSide}}<hr id=answer>{{Reverso}}', fields, 'answer', 0, false),
    ).toBe('París');
  });

  it('[CA-122] las secciones se muestran según el campo esté lleno o vacío', () => {
    expect(
      renderAnkiSide('{{#Extra}}Ojo: {{Extra}}{{/Extra}}fin', fields, 'question', 0, false),
    ).toBe('fin');
    expect(renderAnkiSide('{{^Extra}}sin extra{{/Extra}}', fields, 'question', 0, false)).toBe(
      'sin extra',
    );
  });

  it('[CA-122] los filtros conocidos dejan el campo y los de voz o escritura no ensucian la pregunta', () => {
    expect(renderAnkiSide('{{text:Anverso}}', fields, 'question', 0, false)).toBe(
      '¿Capital de Francia?',
    );
    expect(renderAnkiSide('{{Anverso}}{{type:Reverso}}', fields, 'question', 0, false)).toBe(
      '¿Capital de Francia?',
    );
    expect(renderAnkiSide('{{tts es_AR:Anverso}}{{Anverso}}', fields, 'question', 0, false)).toBe(
      '¿Capital de Francia?',
    );
  });

  it('[CA-122] una cloze oculta solo su hueco y la respuesta es lo oculto', () => {
    const cloze = { Texto: '{{c1::Tucumán}} en {{c2::1816::año}}', Extra: '' };
    expect(renderAnkiSide('{{cloze:Texto}}', cloze, 'question', 0, true)).toBe('[...] en 1816');
    expect(renderAnkiSide('{{cloze:Texto}}', cloze, 'question', 1, true)).toBe('Tucumán en [año]');
    expect(renderAnkiSide('{{cloze:Texto}}', cloze, 'answer', 1, true)).toBe('1816');
  });
});

describe('el HTML de Anki como contenido de Retenia', () => {
  it('[CA-122] el texto con marcas queda como texto y los saltos se conservan', () => {
    const { nodes } = ankiHtmlToNodes('<b>Hola</b><br>mundo &amp; más&nbsp;cosas', media);
    expect(nodes).toEqual([{ type: 'text', text: 'Hola\nmundo & más cosas' }]);
  });

  it('[CA-122] una imagen del mazo pasa a ser una imagen de la tarjeta', () => {
    const { nodes, missing } = ankiHtmlToNodes('Mirá <img src="bandera.png">', media);
    expect(missing).toEqual([]);
    expect(nodes).toEqual([
      { type: 'text', text: 'Mirá ' },
      { type: 'image', sha: SHA, width: 60, height: 36, alt: 'bandera.png' },
    ]);
  });

  it('[CA-122] una imagen que no vino en el mazo se informa como faltante', () => {
    const { nodes, missing } = ankiHtmlToNodes('Mirá <img src="no-esta.png">', media);
    expect(missing).toEqual(['no-esta.png']);
    expect(nodes).toEqual([{ type: 'text', text: 'Mirá' }]);
  });

  it('[CA-122] los audios se separan del texto', () => {
    const { nodes, audio } = ankiHtmlToNodes('hola [sound:hola.mp3]', media);
    expect(audio).toEqual(['hola.mp3']);
    expect(nodes).toEqual([{ type: 'text', text: 'hola' }]);
  });

  it('[CA-122] los scripts y estilos no entran: el contenido es dato, nunca instrucción', () => {
    const { nodes } = ankiHtmlToNodes(
      '<script>window.x = 1</script><style>b{}</style>Hola<iframe src="x"></iframe>',
      media,
    );
    expect(nodes).toEqual([{ type: 'text', text: 'Hola' }]);
  });

  it('[CA-122] las fórmulas de MathJax pasan a fórmulas entre signos $', () => {
    const { nodes, latex } = ankiHtmlToNodes('\\(x^2\\) y \\[\\sqrt{n}\\]', media);
    expect(latex).toBe(false);
    expect(nodes).toEqual([{ type: 'text', text: '$x^2$ y $\\sqrt{n}$' }]);
    expect(ankiHtmlToNodes('[latex]x^2[/latex]', media).latex).toBe(true);
  });
});

// Una colección como la de mazo-demo.apkg: tres notas (dos básicas y una cloze) con 5 repasos que
// cuentan y una reprogramación a mano que no.
function demoCollection(): AnkiCollection {
  const at = (day: string) => {
    const [d, m] = day.split('/').map(Number);
    return Date.UTC(2027, (m ?? 1) - 1, d ?? 1, 13);
  };
  return {
    notetypes: [
      {
        id: 1,
        name: 'Básico',
        kind: 'normal',
        fields: ['Anverso', 'Reverso'],
        templates: [
          { ord: 0, qfmt: '{{Anverso}}', afmt: '{{FrontSide}}<hr id=answer>{{Reverso}}' },
        ],
      },
      {
        id: 3,
        name: 'Cloze',
        kind: 'cloze',
        fields: ['Texto', 'Extra'],
        templates: [{ ord: 0, qfmt: '{{cloze:Texto}}', afmt: '{{cloze:Texto}}<br>{{Extra}}' }],
      },
    ],
    decks: [{ id: 10, name: 'Independencia' }],
    notes: [
      {
        id: 100,
        guid: 'andes',
        mid: 1,
        tags: ['independencia', 'demo'],
        fields: ['¿Quién?', 'San Martín'],
      },
      {
        id: 200,
        guid: 'bandera',
        mid: 1,
        tags: [],
        fields: ['¿Qué?<img src="bandera.png">', 'La bandera'],
      },
      { id: 300, guid: 'tucuman', mid: 3, tags: [], fields: ['En {{c1::Tucumán}}.', ''] },
    ],
    cards: [
      { id: at('01/01'), nid: 100, did: 10, odid: 0, ord: 0, queue: 2 },
      { id: at('02/01'), nid: 200, did: 10, odid: 0, ord: 0, queue: -1 },
      { id: at('03/01'), nid: 300, did: 10, odid: 0, ord: 0, queue: 2 },
    ],
    revlog: [
      { id: at('02/02'), cid: at('01/01'), ease: 3, type: 0 },
      { id: at('06/02'), cid: at('01/01'), ease: 4, type: 1 },
      { id: at('10/02'), cid: at('02/01'), ease: 1, type: 0 },
      { id: at('11/02'), cid: at('02/01'), ease: 3, type: 2 },
      { id: at('20/02'), cid: at('02/01'), ease: 0, type: 4 },
      { id: at('01/03'), cid: at('03/01'), ease: 2, type: 0 },
    ],
  };
}

describe('el paquete de un mazo', () => {
  it('[CA-122] trae 3 tarjetas y 5 repasos con su fecha real, y saltea la reprogramación', () => {
    const pkg = buildAnkiPackage(demoCollection(), media);
    expect(pkg.cards).toHaveLength(3);
    expect(pkg.cards.flatMap((card) => card.reviews)).toHaveLength(5);
    expect(pkg.skippedReviews).toBe(1);
    expect(pkg.rejected).toEqual([]);
    const [andes] = pkg.cards;
    expect(andes?.key).toBe('anki:andes:0');
    expect(andes?.topic).toBe('Independencia');
    expect(andes?.tags).toEqual(['independencia', 'demo']);
    expect(andes?.reviews.map((review) => [review.at, review.grade])).toEqual([
      ['2027-02-02T13:00:00.000Z', 'good'],
      ['2027-02-06T13:00:00.000Z', 'good'],
    ]);
  });

  it('[CA-122] la cloze entra como tarjeta de completar y la suspendida entra pausada', () => {
    const pkg = buildAnkiPackage(demoCollection(), media);
    const cloze = pkg.cards.find((card) => card.key === 'anki:tucuman:0');
    expect(cloze?.kind).toBe('cloze');
    expect(cloze?.question).toEqual([{ type: 'text', text: 'En [...].' }]);
    expect(cloze?.answer).toEqual([{ type: 'text', text: 'Tucumán' }]);
    expect(pkg.cards.find((card) => card.key === 'anki:bandera:0')?.suspended).toBe(true);
  });

  it('[CA-122] el mazo de un submazo da el tema «Mazo › Submazo»', () => {
    const collection = demoCollection();
    collection.decks = [{ id: 10, name: 'Historia::Independencia' }];
    expect(buildAnkiPackage(collection, media).cards[0]?.topic).toBe('Historia › Independencia');
  });

  it('[CA-122] una tarjeta de oclusión de imagen se rechaza con su motivo', () => {
    const collection = demoCollection();
    collection.notetypes.push({
      id: 4,
      name: 'Oclusión de imagen',
      kind: 'cloze',
      fields: ['Occlusion', 'Image'],
      templates: [
        { ord: 0, qfmt: '{{image-occlusion:Occlusion}}', afmt: '{{image-occlusion:Occlusion}}' },
      ],
    });
    collection.notes.push({ id: 400, guid: 'oclusion', mid: 4, tags: [], fields: ['x', 'y'] });
    collection.cards.push({ id: 5, nid: 400, did: 10, odid: 0, ord: 0, queue: 0 });
    const pkg = buildAnkiPackage(collection, media);
    expect(pkg.cards).toHaveLength(3);
    expect(pkg.rejected).toEqual([{ what: 'x', reason: 'unsupportedCard' }]);
  });

  it('[CA-122] una tarjeta que queda vacía se rechaza', () => {
    const collection = demoCollection();
    collection.notes.push({ id: 500, guid: 'vacia', mid: 1, tags: [], fields: ['', ''] });
    collection.cards.push({ id: 6, nid: 500, did: 10, odid: 0, ord: 0, queue: 0 });
    expect(buildAnkiPackage(collection, media).rejected).toEqual([
      { what: '(tarjeta sin texto)', reason: 'emptyCard' },
    ]);
  });

  it('[CA-122] una tarjeta de un mazo filtrado vuelve a su mazo de origen', () => {
    const collection = demoCollection();
    collection.decks.push({ id: 99, name: 'Filtrado 1' });
    const first = collection.cards[0];
    if (first) {
      first.did = 99;
      first.odid = 10;
    }
    expect(buildAnkiPackage(collection, media).cards[0]?.topic).toBe('Independencia');
  });
});

describe('la vista previa', () => {
  it('[CA-122] cuenta lo que entra: 3 tarjetas, 5 repasos y ninguna rechazada', () => {
    const plan = planImport(buildAnkiPackage(demoCollection(), media), new Set());
    expect(plan.cards).toEqual({ fresh: 3, existing: 0 });
    expect(plan.reviews).toBe(5);
    expect(plan.rejected).toEqual([]);
    expect(plan.withoutHistory).toBe(0);
  });

  it('[CA-124] lo que ya estaba no se cuenta como nuevo ni trae sus repasos', () => {
    const pkg = buildAnkiPackage(demoCollection(), media);
    const plan = planImport(pkg, new Set(pkg.cards.map((card) => card.key)));
    expect(plan.cards).toEqual({ fresh: 0, existing: 3 });
    expect(plan.reviews).toBe(0);
  });

  it('[CA-122] las tarjetas sin repasos se cuentan aparte: entran «Disponibles»', () => {
    const collection = demoCollection();
    collection.revlog = [];
    expect(planImport(buildAnkiPackage(collection, media), new Set()).withoutHistory).toBe(3);
  });
});
