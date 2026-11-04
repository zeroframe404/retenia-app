import { z } from 'zod';
import cast from '../../../datos-de-ejemplo/elenco/materias.json';
import cardCast from '../../../datos-de-ejemplo/elenco/tarjetas.json';
import { findHoles } from '../../core/cards';
import type { Grade } from '../../core/memory';
import type { IncomingBlock } from '../../core/organization';
import type { SeedCard, SeedReview } from '../../data/demo-cards';
import { newId } from '../../data/ids';
import type { Workspace } from '../../data/workspace';
import type { InlineNode } from '../../preload/contract/notes';

// El elenco de la Fase 07 (datos-de-ejemplo/elenco/materias.json): materias, temas y notas con
// contenido real. Cada renglón es una lista de partes: texto, hueco de una tarjeta de completar,
// enlace a otra nota (por su título) o imagen (por su nombre en «images», siempre un PNG).
const part = z.union([
  z.strictObject({ text: z.string().min(1) }),
  z.strictObject({ cloze: z.string().min(1) }),
  z.strictObject({ link: z.string().min(1) }),
  z.strictObject({ image: z.string().min(1), alt: z.string() }),
]);
const castSchema = z.strictObject({
  subjects: z.array(
    z.strictObject({
      name: z.string().min(1),
      active: z.boolean(),
      topics: z.array(z.string().min(1)),
      notes: z.array(
        z.strictObject({
          title: z.string().min(1),
          topic: z.string().min(1),
          blocks: z
            .array(
              z.strictObject({
                depth: z.union([z.literal(0), z.literal(1)]),
                parts: z.array(part).min(1),
              }),
            )
            .min(1),
        }),
      ),
    }),
  ),
  images: z.record(
    z.string(),
    z.strictObject({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      base64: z.string().min(1),
    }),
  ),
});

// Siembra las materias del elenco, con sus temas, sus notas (con fórmulas, una imagen y enlaces
// entre ellas) y, al final, la materia «Ejemplo» en pausa. Se hace una sola vez: solo si todavía no
// hay ninguna materia. Todo queda anotado como de la demostración y no aparece en «Actividad
// reciente». Devuelve cuántas materias hay después (cero si no correspondía sembrar).
export function seedDemoOrganization(workspace: Workspace): number {
  if (workspace.subjects.count() > 0) {
    return 0;
  }
  const elenco = castSchema.parse(cast);
  const images = new Map(
    Object.entries(elenco.images).map(([name, image]) => [
      name,
      {
        sha: workspace.images.save({
          bytes: new Uint8Array(Buffer.from(image.base64, 'base64')),
          mime: 'image/png',
          width: image.width,
          height: image.height,
        }).sha,
        width: image.width,
        height: image.height,
      },
    ]),
  );

  // Primero todas las notas (vacías), para que los enlaces puedan apuntar a cualquiera.
  const created: {
    noteId: string;
    firstBlockId: string;
    note: (typeof elenco.subjects)[number]['notes'][number];
  }[] = [];
  const noteIds = new Map<string, string>();
  for (const subject of elenco.subjects) {
    const { id: subjectId } = workspace.subjects.create({
      name: subject.name,
      makeActive: subject.active,
    });
    const topicIds = new Map<string, string>();
    for (const name of subject.topics) {
      topicIds.set(name, workspace.topics.create({ subjectId, name }, { source: 'demo' }).id);
    }
    for (const note of subject.notes) {
      const topicId = topicIds.get(note.topic);
      if (topicId === undefined) {
        throw new Error(`El elenco nombra un tema que no existe: ${note.topic}`);
      }
      const made = workspace.notes.create({ subjectId, topicId }, { source: 'demo' });
      noteIds.set(note.title, made.id);
      created.push({ noteId: made.id, firstBlockId: made.blocks[0]?.id ?? newId(), note });
    }
  }

  for (const { noteId, firstBlockId, note } of created) {
    const blocks: IncomingBlock[] = [];
    let lastRoot: string | null = null;
    for (const block of note.blocks) {
      const id = blocks.length === 0 ? firstBlockId : newId();
      const parentId = block.depth === 0 ? null : lastRoot;
      if (block.depth === 0) {
        lastRoot = id;
      }
      const content: InlineNode[] = block.parts.map((item) => {
        if ('text' in item) {
          return { type: 'text', text: item.text };
        }
        if ('cloze' in item) {
          return { type: 'cloze', id: newId(), text: item.cloze };
        }
        if ('link' in item) {
          const target = noteIds.get(item.link);
          if (target === undefined) {
            throw new Error(`El elenco enlaza una nota que no existe: ${item.link}`);
          }
          return { type: 'mention', id: target, label: item.link };
        }
        const image = images.get(item.image);
        if (image === undefined) {
          throw new Error(`El elenco usa una imagen que no existe: ${item.image}`);
        }
        return {
          type: 'image',
          sha: image.sha,
          width: image.width,
          height: image.height,
          alt: item.alt,
        };
      });
      blocks.push({ id, parentId, collapsed: false, content });
    }
    workspace.notes.save({ noteId, title: note.title, blocks }, { source: 'demo' });
  }

  workspace.subjects.createExample({ activate: false }, { source: 'demo' });
  return workspace.subjects.count();
}

// --- Las tarjetas del elenco (Fase 08) ---

// El esquema se arma al usarlo (no al cargar el módulo): así, en la versión real, el empaquetador
// descarta toda esta siembra y ninguna de sus palabras queda en el paquete.
const cardCastSchema = () =>
  z.strictObject({
    subjects: z.array(
      z.strictObject({
        name: z.string().min(1),
        topics: z.array(
          z.strictObject({
            name: z.string().min(1),
            cards: z
              .array(
                z.strictObject({
                  q: z.string().min(1),
                  a: z.string().min(1).optional(),
                  p: z.enum(['d', 'n', 's', 'desvio', 'consolidada', 'varianza', 'fallos']),
                }),
              )
              .min(1),
          }),
        ),
      }),
    ),
  });

// El lunes 15/03/2027 a las 10:00 de Buenos Aires: el «hoy» de la demostración.
const DEMO_NOW = new Date('2027-03-15T10:00:00-03:00');
const DAY_MS = 86_400_000;

type Template = readonly (readonly [daysAgo: number, grade: Grade])[];
const good: Grade = 'good';
const hard: Grade = 'hard';
const again: Grade = 'again';

// Historiales de ejemplo. Cada uno se eligió mirando cuándo vence la tarjeta con el motor de
// repasos (el 15/03/2027): los «vencidas» vencen hoy o antes, los «programadas» vencen después, y los
// «sin verse» llevan entre 27 y 33 días sin verse y siguen programados.
const DUE: readonly Template[] = [
  [[2, good]],
  [[5, good]],
  [[9, hard]],
  [[6, again]],
  [
    [12, hard],
    [11, again],
  ],
  [[4, hard]],
  [[8, good]],
  [
    [15, hard],
    [14, again],
  ],
  [[3, again]],
  [
    [22, good],
    [16, again],
  ],
];
const SCHEDULED: readonly Template[] = [
  [[1, good]],
  [
    [3, good],
    [1, good],
  ],
  [
    [12, good],
    [5, good],
  ],
  [
    [40, good],
    [20, good],
  ],
  [
    [60, good],
    [35, good],
    [8, good],
  ],
  [
    [2, again],
    [1, good],
  ],
  [
    [10, good],
    [6, good],
  ],
  [
    [6, hard],
    [3, good],
  ],
  [
    [20, good],
    [15, good],
    [2, good],
  ],
  [
    [11, good],
    [1, hard],
  ],
  [
    [30, good],
    [26, good],
    [4, good],
  ],
];
const UNSEEN: readonly Template[] = [
  [
    [50, good],
    [30, good],
  ],
  [
    [58, good],
    [45, good],
    [28, good],
  ],
  [
    [44, good],
    [31, hard],
    [27, good],
  ],
  [
    [70, good],
    [50, good],
    [30, good],
  ],
  [
    [48, good],
    [29, good],
  ],
  [
    [56, good],
    [40, good],
    [32, good],
  ],
  [
    [65, good],
    [44, good],
    [29, good],
  ],
  [
    [49, good],
    [28, good],
  ],
  [
    [55, good],
    [33, good],
  ],
  [
    [80, good],
    [55, good],
    [33, good],
  ],
];
const SPECIAL: Record<string, Template> = {
  // Con dudas el 20/02/2027 (hace 23 días): vence hoy y es la primera de la cola.
  desvio: [
    [27, again],
    [25, good],
    [23, hard],
  ],
  // Tres aciertos sin ayuda en días distintos, uno con 8 días de demora.
  consolidada: [
    [60, good],
    [50, good],
    [30, good],
  ],
  varianza: [
    [18, good],
    [7, good],
  ],
  // Cuatro fallos: sale de la cola y va a «Mejorar la tarjeta».
  fallos: [
    [40, again],
    [30, again],
    [20, again],
    [1, again],
  ],
};
// El historial de las tres tarjetas que nacieron en la nota «Intervalos de confianza».
const NOTE_BORN: readonly Template[] = [
  [
    [40, good],
    [20, good],
  ],
  [
    [12, good],
    [5, good],
  ],
  [
    [3, good],
    [1, good],
  ],
];

const reviewsOf = (template: Template): SeedReview[] =>
  template.map(([daysAgo, grade]) => ({
    at: new Date(DEMO_NOW.getTime() - daysAgo * DAY_MS),
    grade,
  }));

// Las tarjetas de Estadística básica (180) y de Historia argentina (12) con su historial, como
// eventos de origen «demostración»: el 15/03/2027 quedan 60 vencidas, 30 nuevas y 90 programadas en
// Estadística básica. Se hace una sola vez, después de sembrar las materias y las notas (tres
// tarjetas nacen en la nota «Intervalos de confianza»). Devuelve cuántas tarjetas hay después
// (cero si no correspondía sembrar).
export function seedDemoCardCast(workspace: Workspace): number {
  if (workspace.cards.hasManualCards()) {
    return 0;
  }
  const elenco = cardCastSchema().parse(cardCast);
  const created = new Date(DEMO_NOW.getTime() - 90 * DAY_MS);
  let dueTurn = 0;
  let scheduledTurn = 0;
  let unseenUsed = 0;
  const entries: SeedCard[] = [];
  const subjects = workspace.subjects.list().subjects;
  for (const subjectCast of elenco.subjects) {
    const subject = subjects.find((item) => item.name === subjectCast.name);
    if (!subject) {
      throw new Error(
        `El elenco de tarjetas nombra una materia que no existe: ${subjectCast.name}`,
      );
    }
    const topics = workspace.topics.list({ subjectId: subject.id }).topics;
    for (const topicCast of subjectCast.topics) {
      const topic = topics.find((item) => item.name === topicCast.name);
      if (!topic) {
        throw new Error(`El elenco de tarjetas nombra un tema que no existe: ${topicCast.name}`);
      }
      for (const card of topicCast.cards) {
        const hole = card.a === undefined ? findHoles(card.q)[0] : undefined;
        if (card.a === undefined && hole === undefined) {
          throw new Error(`Tarjeta de completar sin hueco: ${card.q}`);
        }
        let template: Template | undefined = SPECIAL[card.p];
        if (card.p === 'd') {
          template = DUE[dueTurn++ % DUE.length];
        } else if (card.p === 's') {
          // Una de cada ocho programadas lleva entre 27 y 33 días sin verse.
          if (scheduledTurn % 8 === 3 && unseenUsed < UNSEEN.length) {
            template = UNSEEN[unseenUsed++];
          } else {
            template = SCHEDULED[scheduledTurn % SCHEDULED.length];
          }
          scheduledTurn += 1;
        } else if (card.p === 'n') {
          template = [];
        }
        entries.push({
          question: hole ? `${card.q.slice(0, hole.start)}[...]${card.q.slice(hole.end)}` : card.q,
          answer: hole ? hole.inner.trim() : (card.a ?? ''),
          kind: hole ? 'cloze' : 'qa',
          subjectId: subject.id,
          topicId: topic.id,
          createdAt: created,
          reviews: reviewsOf(template ?? []),
        });
      }
    }
  }
  // Se siembran al revés: la primera del archivo queda primera en la lista (más nueva por
  // identificador).
  workspace.cards.plantCast([...entries].reverse());

  const statistics = subjects.find((item) => item.name === 'Estadística básica');
  if (statistics) {
    const born = workspace.cards
      .list({ subjectId: statistics.id })
      .map((card) => workspace.cards.get({ cardId: card.id }))
      .filter((card) => card.path.noteTitle === 'Intervalos de confianza')
      .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'qa' ? -1 : 1));
    workspace.cards.plantHistory(
      born.flatMap((card, index) => {
        const template = NOTE_BORN[index];
        return template
          ? [{ cardId: card.id, createdAt: created, reviews: reviewsOf(template) }]
          : [];
      }),
    );
  }
  return workspace.cards.count();
}
