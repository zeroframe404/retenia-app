import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCards, seedDemoOrganization } from '../../src/main/demo/seed';
import { texts } from '../../src/preload/contract/texts';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// El elenco de ejemplo de la Fase 07 (solo en «Retenia (prueba)»): cuatro materias, sus temas,
// tres notas con contenido real, fórmulas, una imagen y enlaces entre ellas.

afterEach(closeSpaces);

function seeded() {
  const space = openSpace();
  seedDemoCards(space.workspace.cards);
  const count = seedDemoOrganization(space.workspace);
  return { ...space, count };
}

const subjectNamed = (workspace: Workspace, name: string) => {
  const found = workspace.subjects.list().subjects.find((subject) => subject.name === name);
  if (!found) {
    throw new Error(`falta la materia ${name}`);
  }
  return found;
};

const noteTitled = (workspace: Workspace, subjectName: string, title: string) => {
  const subject = subjectNamed(workspace, subjectName);
  const summary = workspace.notes
    .list({ subjectId: subject.id })
    .notes.find((n) => n.title === title);
  if (!summary) {
    throw new Error(`falta la nota ${title}`);
  }
  return workspace.notes.get({ noteId: summary.id });
};

const textOf = (block: { content: readonly { type: string; text?: string; label?: string }[] }) =>
  block.content.map((node) => node.text ?? node.label ?? '').join('');

describe('siembra del elenco: materias y temas', () => {
  it('con la base vacía deja cuatro materias: «Estadística básica» activa, dos en mantenimiento y «Ejemplo» en pausa', () => {
    const { workspace, count } = seeded();
    expect(count).toBe(4);
    expect(
      workspace.subjects
        .list()
        .subjects.map(({ name, status, isExample }) => [name, status, isExample]),
    ).toEqual([
      ['Estadística básica', 'active', false],
      ['Historia argentina', 'maintenance', false],
      ['Inglés', 'maintenance', false],
      ['Ejemplo', 'paused', true],
    ]);
  });

  it('«Estadística básica» tiene tres temas, «Historia argentina» uno e «Inglés» ninguno', () => {
    const { workspace } = seeded();
    const topicNames = (name: string) =>
      workspace.topics
        .list({ subjectId: subjectNamed(workspace, name).id })
        .topics.map((t) => t.name);
    expect(topicNames('Estadística básica')).toEqual([
      'Media y dispersión',
      'Intervalos de confianza',
      'Pruebas de hipótesis',
    ]);
    expect(topicNames('Historia argentina')).toEqual(['Independencia']);
    expect(topicNames('Inglés')).toEqual([]);
    expect(topicNames('Ejemplo')).toEqual([texts.example.topic]);
  });

  it('«Inglés» es una materia común, sin notas', () => {
    const { workspace } = seeded();
    const english = subjectNamed(workspace, 'Inglés');
    expect(english.isExample).toBe(false);
    expect(workspace.notes.list({ subjectId: english.id }).notes).toEqual([]);
  });

  it('las notas están en su tema y los temas cuentan sus notas', () => {
    const { workspace } = seeded();
    const statistics = subjectNamed(workspace, 'Estadística básica');
    const topics = workspace.topics.list({ subjectId: statistics.id }).topics;
    const byName = (name: string) => topics.find((topic) => topic.name === name);
    expect(noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza').topicId).toBe(
      byName('Intervalos de confianza')?.id,
    );
    expect(noteTitled(workspace, 'Estadística básica', 'Media y desvío').topicId).toBe(
      byName('Media y dispersión')?.id,
    );
    expect(topics.map((topic) => [topic.name, topic.noteCount])).toEqual([
      ['Media y dispersión', 1],
      ['Intervalos de confianza', 1],
      ['Pruebas de hipótesis', 0],
    ]);
    expect(noteTitled(workspace, 'Historia argentina', 'Revolución de Mayo').blocks).toHaveLength(
      2,
    );
  });

  it('la Bandeja empieza vacía y las tres tarjetas de la Fase 03 siguen ahí', () => {
    const { workspace } = seeded();
    expect(workspace.inbox.list()).toEqual({ items: [], count: 0 });
    expect(workspace.cards.count()).toBe(3);
  });
});

describe('siembra del elenco: las notas', () => {
  it('«Intervalos de confianza» tiene sus renglones, con la sangría, la fórmula y la imagen', () => {
    const { workspace } = seeded();
    const note = noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza');

    expect(note.blocks.map((block) => [block.parentId === null ? 0 : 1, textOf(block)])).toEqual([
      [
        0,
        'Un intervalo de confianza da un rango de valores plausibles para un parámetro, por ejemplo la media de la población.',
      ],
      [0, 'Error estándar de la media: s / sqrt(n)'],
      [1, 's es el desvío de la muestra y n es su tamaño.'],
      [0, 'El intervalo para la media: $\\bar{x} \\pm t \\cdot s/\\sqrt{n}$'],
      [0, 'varianza: el promedio de los cuadrados de las distancias a la media.'],
      [
        0,
        'El 95 % no es la probabilidad de que la media esté en este intervalo: habla del procedimiento.',
      ],
      [0, ''],
      [0, 'Ver también Media y desvío'],
    ]);
    // El renglón hijo cuelga del «Error estándar».
    expect(note.blocks[2]?.parentId).toBe(note.blocks[1]?.id);
  });

  it('la fórmula del intervalo está entre signos $, para que se dibuje como en un libro', () => {
    const { workspace } = seeded();
    const note = noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza');
    expect(textOf(note.blocks[3] ?? { content: [] })).toMatch(/\$[^$]+\$/);
  });

  it('la imagen es una campana de 320 por 200 que está guardada en la carpeta de datos', () => {
    const { workspace } = seeded();
    const note = noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza');
    const image = note.blocks[6]?.content[0];
    expect(image).toMatchObject({
      type: 'image',
      width: 320,
      height: 200,
      alt: 'Curva normal, la campana de Gauss',
    });
    const { mime, bytes } = workspace.images.read({
      sha: image?.type === 'image' ? image.sha : '',
    });
    expect(mime).toBe('image/png');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([320, 200]);
  });

  it('«Media y desvío» tiene sus renglones y enlaza a «Intervalos de confianza»', () => {
    const { workspace } = seeded();
    const note = noteTitled(workspace, 'Estadística básica', 'Media y desvío');
    expect(note.blocks.map((block) => [block.parentId === null ? 0 : 1, textOf(block)])).toEqual([
      [
        0,
        'La media es el promedio de los datos: se suman los valores y se divide por la cantidad.',
      ],
      [0, 'El desvío estándar mide cuánto se alejan, en promedio, los datos de la media.'],
      [1, 'Es la raíz cuadrada de la varianza.'],
      [0, 'Para ver cómo se usa en un intervalo: Intervalos de confianza'],
    ]);
  });

  it('[CA-374] los enlaces entre las dos notas apuntan a la otra por su identificador', () => {
    const { workspace } = seeded();
    const intervals = noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza');
    const mean = noteTitled(workspace, 'Estadística básica', 'Media y desvío');
    const mentionOf = (note: typeof intervals) =>
      note.blocks.flatMap((block) => block.content).find((node) => node.type === 'mention');
    expect(mentionOf(intervals)).toEqual({ type: 'mention', id: mean.id, label: 'Media y desvío' });
    expect(mentionOf(mean)).toEqual({
      type: 'mention',
      id: intervals.id,
      label: 'Intervalos de confianza',
    });
  });

  it('[CA-375] «Mencionada en» de cada una muestra a la otra', () => {
    const { workspace } = seeded();
    const intervals = noteTitled(workspace, 'Estadística básica', 'Intervalos de confianza');
    const mean = noteTitled(workspace, 'Estadística básica', 'Media y desvío');
    expect(
      workspace.notes.mentions({ noteId: mean.id }).mentions.map((m) => [m.noteId, m.noteTitle]),
    ).toEqual([[intervals.id, 'Intervalos de confianza']]);
    expect(
      workspace.notes
        .mentions({ noteId: intervals.id })
        .mentions.map((m) => [m.noteId, m.noteTitle]),
    ).toEqual([[mean.id, 'Media y desvío']]);
  });

  it('[CA-041] «Ejemplo» trae su nota con los renglones del catálogo y su etiqueta', () => {
    const { workspace } = seeded();
    const example = subjectNamed(workspace, 'Ejemplo');
    expect(example.isExample).toBe(true);
    const note = noteTitled(workspace, 'Ejemplo', texts.example.note);
    expect(note.blocks.map(textOf)).toEqual(texts.example.blocks.map((block) => block.text));
  });
});

describe('siembra del elenco: una sola vez y como demostración', () => {
  it('sembrar de nuevo no duplica nada', () => {
    const { workspace } = seeded();
    expect(seedDemoOrganization(workspace)).toBe(0);
    expect(workspace.subjects.count()).toBe(4);
    expect(
      readRows(workspace.dataDir.concat('/retenia.db'), 'SELECT count(*) AS n FROM notes'),
    ).toEqual([{ n: 4 }]);
  });

  it('abrir otra vez la misma carpeta no duplica el elenco', () => {
    const space = seeded();
    const reopened = space.reopen();
    expect(seedDemoOrganization(reopened)).toBe(0);
    expect(reopened.subjects.count()).toBe(4);
  });

  it('si ya hay una materia (la tuya), no siembra ni toca nada', () => {
    const { workspace } = openSpace();
    workspace.subjects.create({ name: 'Química orgánica', makeActive: true });
    expect(seedDemoOrganization(workspace)).toBe(0);
    expect(workspace.subjects.list().subjects.map((subject) => subject.name)).toEqual([
      'Química orgánica',
    ]);
  });

  it('todo queda anotado como de la demostración y no aparece en «Actividad reciente»', () => {
    const { workspace, file } = seeded();
    expect(workspace.activity.recent()).toEqual([]);
    expect(readRows(file, 'SELECT DISTINCT source FROM operations')).toEqual([{ source: 'demo' }]);
  });

  it('lo que sembró se puede abrir al cerrar y abrir', () => {
    const space = seeded();
    const reopened = space.reopen();
    expect(noteTitled(reopened, 'Estadística básica', 'Media y desvío').blocks).toHaveLength(4);
  });
});

describe('el elenco no llega a la versión real', () => {
  it('una carpeta de datos de la versión real, que nunca siembra, no trae materias, notas ni Bandeja', () => {
    const { workspace } = openSpace();
    expect(workspace.subjects.count()).toBe(0);
    expect(workspace.cards.count()).toBe(0);
    expect(workspace.inbox.list().count).toBe(0);
  });

  it('el elenco de esta fase vive solo en datos-de-ejemplo y su imagen es la misma que campana.png', () => {
    const folder = join(ROOT, 'datos-de-ejemplo');
    const cast = JSON.parse(readFileSync(join(folder, 'elenco', 'materias.json'), 'utf8')) as {
      images: { campana: { base64: string } };
    };
    expect(cast.images.campana.base64).toBe(
      readFileSync(join(folder, 'campana.png')).toString('base64'),
    );
  });
});
