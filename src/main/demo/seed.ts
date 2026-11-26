import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import cast from '../../../datos-de-ejemplo/elenco/materias.json';
import cardCast from '../../../datos-de-ejemplo/elenco/tarjetas.json';
import { findHoles } from '../../core/cards';
import { evaluateDecision, evaluateNumeric, referenceText } from '../../core/evaluation';
import { extensionFor, HEAD_BYTES, identifyContent } from '../../core/materials/signature';
import type { Grade } from '../../core/memory';
import type { IncomingBlock } from '../../core/organization';
import type { SeedCard, SeedReview } from '../../data/demo-cards';
import { newId } from '../../data/ids';
import { PIPELINE_VERSION, referenceOf, type StoredCite } from '../../data/materials';
import type { Workspace } from '../../data/workspace';
import { activitySchema } from '../../preload/contract/activities';
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
// Los materiales del elenco (Fase 13): «Inferencia — capítulos 1 a 4.pdf», agregado el lunes
// 08/03/2027, y «Apunte 3.pdf», el viernes 12/03/2027, los dos en «Estadística básica». Entran por
// la misma cola que cualquier material: al abrir Retenia se leen de verdad, en segundo plano.
// El título es el nombre sin la extensión, salvo «trampa.md» (Fase 19, CA-175), que se llama así.
const DEMO_MATERIALS: readonly { file: string; addedAt: string; title?: string }[] = [
  { file: 'Inferencia — capítulos 1 a 4.pdf', addedAt: '2027-03-08T13:00:00.000Z' },
  { file: 'Apunte 3.pdf', addedAt: '2027-03-12T13:00:00.000Z' },
  { file: 'trampa.md', addedAt: '2027-03-13T13:00:00.000Z', title: 'trampa.md' },
];

export interface DemoMaterials {
  inference?: { materialId: string; sha256: string; title: string };
}

// La copia del original en `originales\<sha256>.pdf` (solo lectura) y el material en «Recibido».
// Se hace una sola vez: si ya hay materiales, no se siembra nada.
export function seedDemoMaterials(workspace: Workspace, samplesDir: string | null): DemoMaterials {
  if (samplesDir === null || workspace.materials.count() > 0) {
    return {};
  }
  const subject = workspace.subjects
    .list()
    .subjects.find((item) => item.name === 'Estadística básica');
  if (!subject) {
    return {};
  }
  const seeded: DemoMaterials = {};
  for (const { file, addedAt, title: fixedTitle } of DEMO_MATERIALS) {
    const source = join(samplesDir, file);
    if (!existsSync(source)) {
      continue;
    }
    const data = readFileSync(source);
    const identified = identifyContent({
      head: data.subarray(0, HEAD_BYTES),
      size: data.length,
      name: file,
    });
    if (!identified.ok) {
      continue;
    }
    const sha256 = createHash('sha256').update(data).digest('hex');
    const ext = extensionFor(identified.kind);
    mkdirSync(workspace.originalsDir, { recursive: true });
    const target = join(workspace.originalsDir, `${sha256}.${ext}`);
    if (!existsSync(target)) {
      writeFileSync(target, data);
      chmodSync(target, 0o444);
    }
    const title = fixedTitle ?? file.replace(/\.[^.]+$/, '');
    const materialId = workspace.materials.create({
      subjectId: subject.id,
      title,
      kind: identified.kind,
      originalSha256: sha256,
      originalName: file,
      originalExt: ext,
      sizeBytes: data.length,
      errorCode: null,
      addedAt,
    });
    if (file.startsWith('Inferencia')) {
      seeded.inference = { materialId, sha256, title };
    }
  }
  return seeded;
}

// La fuente y la cita de una tarjeta del elenco que cita el PDF de ejemplo. La cita se busca en el
// original cada vez que se abre: no depende de cuándo terminó la lectura.
function citeOf(
  cita: { pagina: number; texto: string } | undefined,
  inference: DemoMaterials['inference'],
): { sourceText?: string; sourceCite?: string } {
  if (!cita || !inference) {
    return {};
  }
  const cite: StoredCite = {
    materialId: inference.materialId,
    originalSha256: inference.sha256,
    materialVersion: 1,
    pipelineVersion: PIPELINE_VERSION,
    locator: {
      kind: 'pdf',
      page: cita.pagina,
      boxes: [],
      quote: cita.texto,
      before: '',
      after: '',
      paragraphIndex: -1,
      headingPath: [],
    },
    quote: cita.texto,
  };
  return {
    sourceText: referenceOf(inference.title, 'pdf', cita.pagina, []),
    sourceCite: JSON.stringify(cite),
  };
}

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
                  // La frase del PDF de ejemplo que cita la tarjeta (Fase 13).
                  cita: z
                    .strictObject({ pagina: z.number().int().positive(), texto: z.string().min(1) })
                    .optional(),
                }),
              )
              .min(1),
          }),
        ),
      }),
    ),
    // Fase 16: los ejercicios (se listan en «Tarjetas» con la marca «Ejercicio» y no suman al 180).
    ejercicios: z
      .array(
        z
          .strictObject({
            materia: z.string().min(1),
            tema: z.string().min(1).nullable(),
            pregunta: z.string().min(1),
            // La respuesta corta la dice; en los demás tipos sale de la actividad.
            respuesta: z.string().min(1).optional(),
            // Un procedimiento o una decisión se marcan acá (Fase 18) y su actividad no dice el
            // tipo: las palabras internas del programa no van en los datos de ejemplo, que no
            // pueden aparecer en el paquete de uso real (CA-013).
            procedimiento: z.literal(true).optional(),
            decision: z.literal(true).optional(),
            actividad: z.record(z.string(), z.unknown()),
            pistas: z.array(z.string().min(1)).max(3),
            ejemplo: z.string(),
            explicacion: z.string(),
            cita: z
              .strictObject({ pagina: z.number().int().positive(), texto: z.string().min(1) })
              .optional(),
          })
          .transform(({ procedimiento, decision, actividad, ...exercise }) => {
            const type = procedimiento ? 'procedure' : decision ? 'decision' : undefined;
            return {
              ...exercise,
              actividad: activitySchema.parse(type ? { ...actividad, type } : actividad),
            };
          }),
      )
      .optional(),
    // Fase 17: los objetivos del elenco, con las preguntas de sus actividades.
    objetivos: z
      .array(
        z.strictObject({
          materia: z.string().min(1),
          tema: z.string().min(1).nullable(),
          texto: z.string().min(1),
          tipo: z.enum(['remember', 'understand', 'apply', 'reason', 'execute']),
          actividades: z.array(z.string().min(1)),
        }),
      )
      .optional(),
    // Fase 18: los conjuntos intercalados, con las preguntas de los problemas de cada tipo.
    conjuntos: z
      .array(
        z.strictObject({
          materia: z.string().min(1),
          tema: z.string().min(1).nullable(),
          pregunta: z.string().min(1),
          tipos: z.array(
            z.strictObject({
              id: z.string().min(1),
              nombre: z.string().min(1),
              problemas: z.array(z.string().min(1)).min(1),
            }),
          ),
        }),
      )
      .optional(),
    // Fase 18: intentos de otros días sobre ejercicios (haber practicado cada tipo por separado y un
    // error de confusión para «Mis errores»). `respuesta`: lo escrito en un numérico o la opción
    // elegida en una decisión.
    intentos: z
      .array(
        z.strictObject({
          pregunta: z.string().min(1),
          fecha: z.iso.datetime(),
          respuesta: z.string().min(1),
        }),
      )
      .optional(),
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
// Desde la Fase 10 las vencidas de Estadística básica tienen todas una probabilidad de recordarlas
// de 0,78 o más, así «¿Qué mide el desvío estándar?» (0,77) es la primera de la sesión, que toma las
// de menor probabilidad; y vencen después que ella (25/02/2027), así sigue siendo la más atrasada.
const DUE: readonly Template[] = [
  [[2, good]],
  [[9, good]],
  [[5, hard]],
  [
    [12, good],
    [3, again],
  ],
  [
    [20, hard],
    [18, hard],
  ],
  [[3, hard]],
  [[8, good]],
  [
    [22, good],
    [21, hard],
  ],
  [
    [3, good],
    [2, again],
  ],
  [
    [7, good],
    [2, again],
  ],
];
// Las vencidas de una materia en mantenimiento (Historia argentina): con su retención de 0,85 los
// intervalos son más largos (Fase 09), y estas siguen venciendo hoy.
const DUE_KEPT: readonly Template[] = [
  [
    [22, good],
    [16, again],
  ],
  [[9, hard]],
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
export function seedDemoCardCast(workspace: Workspace, materials: DemoMaterials = {}): number {
  if (workspace.cards.hasManualCards()) {
    return 0;
  }
  const elenco = cardCastSchema().parse(cardCast);
  const created = new Date(DEMO_NOW.getTime() - 90 * DAY_MS);
  let dueTurn = 0;
  let keptTurn = 0;
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
        if (card.p === 'd' && subject.status !== 'active') {
          template = DUE_KEPT[keptTurn++ % DUE_KEPT.length];
        } else if (card.p === 'd') {
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
          ...citeOf(card.cita, materials.inference),
        });
      }
    }
  }
  // Se siembran al revés: la primera del archivo queda primera en la lista (más nueva por
  // identificador).
  workspace.cards.plantCast([...entries].reverse());
  workspace.cards.plantCast(exercisesOf(elenco.ejercicios ?? [], subjects, workspace, materials));
  seedObjectives(workspace, elenco.objetivos ?? [], subjects);
  seedSets(workspace, elenco.conjuntos ?? [], subjects);
  seedAttempts(workspace, elenco.intentos ?? [], subjects);

  const statistics = subjects.find((item) => item.name === 'Estadística básica');
  if (statistics) {
    // Las que nacieron en la nota están en su tema: solo esas se abren (abrir las 185 tarjetas de
    // la materia hacía lenta cada siembra).
    const born = workspace.cards
      .list({ subjectId: statistics.id })
      .filter((card) => card.topicName === 'Intervalos de confianza')
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

// Los objetivos del elenco (Fase 17): «Calcular la media y el desvío», «Sin iniciar», con su ejercicio.
// Se enlazan después de sembrar el historial: los intentos de antes no son de ellos.
function seedObjectives(
  workspace: Workspace,
  cast: NonNullable<z.output<ReturnType<typeof cardCastSchema>>['objetivos']>,
  subjects: readonly { id: string; name: string }[],
): void {
  for (const objective of cast) {
    const subject = subjects.find((item) => item.name === objective.materia);
    if (!subject) {
      throw new Error(
        `El elenco de objetivos nombra una materia que no existe: ${objective.materia}`,
      );
    }
    const topic =
      objective.tema === null
        ? null
        : workspace.topics
            .list({ subjectId: subject.id })
            .topics.find((t) => t.name === objective.tema);
    if (topic === undefined) {
      throw new Error(`El elenco de objetivos nombra un tema que no existe: ${objective.tema}`);
    }
    const all = workspace.cards.list({ subjectId: subject.id });
    const cardIds = objective.actividades.map((question) => {
      const card = all.find((item) => item.question === question);
      if (!card) {
        throw new Error(`El elenco de objetivos nombra una actividad que no existe: ${question}`);
      }
      return card.id;
    });
    workspace.objectives.create(
      {
        objectiveId: newId(),
        subjectId: subject.id,
        topicId: topic?.id ?? null,
        text: objective.texto,
        conditions: null,
        kind: objective.tipo,
        cardIds,
      },
      { source: 'demo' },
    );
  }
}

// Una actividad del elenco, por su pregunta.
function castCards(workspace: Workspace, subjects: readonly { id: string }[]) {
  const all = subjects.flatMap((subject) => workspace.cards.list({ subjectId: subject.id }));
  return (question: string) => {
    const card = all.find((item) => item.question === question);
    if (!card) {
      throw new Error(`El elenco nombra una actividad que no existe: ${question}`);
    }
    return card;
  };
}

// «Media, mediana y moda» (Fase 18): el conjunto con sus tipos, cada uno con sus problemas.
function seedSets(
  workspace: Workspace,
  cast: NonNullable<z.output<ReturnType<typeof cardCastSchema>>['conjuntos']>,
  subjects: readonly { id: string; name: string }[],
): void {
  const cardNamed = castCards(workspace, subjects);
  const entries = cast.map((set): SeedCard => {
    const subject = subjects.find((item) => item.name === set.materia);
    const topic = subject
      ? (workspace.topics
          .list({ subjectId: subject.id })
          .topics.find((item) => item.name === set.tema) ?? null)
      : null;
    if (!subject || (set.tema !== null && topic === null)) {
      throw new Error(`El elenco de conjuntos nombra una materia o un tema que no existe`);
    }
    const activity = {
      type: 'interleaved' as const,
      types: set.tipos.map((type) => ({
        id: type.id,
        name: type.nombre,
        cardIds: type.problemas.map((question) => cardNamed(question).id),
      })),
    };
    return {
      question: set.pregunta,
      answer: referenceText(activity) ?? '',
      kind: 'qa',
      subjectId: subject.id,
      topicId: topic?.id ?? null,
      createdAt: new Date(DEMO_NOW.getTime() - 91 * DAY_MS),
      reviews: [],
      activityType: activity.type,
      activity: JSON.stringify(activity),
    };
  });
  workspace.cards.plantCast(entries);
}

// Los intentos de otros días sobre ejercicios del elenco: van con su evaluación, como de la
// demostración.
function seedAttempts(
  workspace: Workspace,
  cast: NonNullable<z.output<ReturnType<typeof cardCastSchema>>['intentos']>,
  subjects: readonly { id: string; name: string }[],
): void {
  const cardNamed = castCards(workspace, subjects);
  workspace.cards.plantAttempts(
    cast.map((attempt) => {
      const card = workspace.cards.get({ cardId: cardNamed(attempt.pregunta).id });
      const activity = card.activity;
      if (activity?.type === 'numeric') {
        return {
          cardId: card.id,
          at: new Date(attempt.fecha),
          activityType: activity.type,
          answer: { type: activity.type, raw: attempt.respuesta },
          verdict: evaluateNumeric(attempt.respuesta, activity, []).verdict,
        };
      }
      if (activity?.type === 'decision') {
        return {
          cardId: card.id,
          at: new Date(attempt.fecha),
          activityType: activity.type,
          answer: {
            type: activity.type,
            optionId: attempt.respuesta,
            shown: activity.options.map((option) => option.id),
          },
          verdict: evaluateDecision(attempt.respuesta, activity.options).verdict,
        };
      }
      throw new Error(`El elenco no sabe sembrar un intento de «${attempt.pregunta}»`);
    }),
  );
}

// Los ejercicios del elenco (Fase 16), sin historial y un día más viejos que las tarjetas: quedan al
// final de la lista, así no cambian el orden que ya tenía.
function exercisesOf(
  cast: NonNullable<z.output<ReturnType<typeof cardCastSchema>>['ejercicios']>,
  subjects: readonly { id: string; name: string }[],
  workspace: Workspace,
  materials: DemoMaterials,
): SeedCard[] {
  const created = new Date(DEMO_NOW.getTime() - 91 * DAY_MS);
  return [...cast].reverse().map((exercise) => {
    const subject = subjects.find((item) => item.name === exercise.materia);
    if (!subject) {
      throw new Error(
        `El elenco de ejercicios nombra una materia que no existe: ${exercise.materia}`,
      );
    }
    const topic =
      exercise.tema === null
        ? null
        : workspace.topics
            .list({ subjectId: subject.id })
            .topics.find((item) => item.name === exercise.tema);
    if (topic === undefined) {
      throw new Error(`El elenco de ejercicios nombra un tema que no existe: ${exercise.tema}`);
    }
    const activity = exercise.actividad;
    return {
      question: exercise.pregunta,
      answer: exercise.respuesta ?? referenceText(activity) ?? '',
      kind: 'qa',
      subjectId: subject.id,
      topicId: topic?.id ?? null,
      createdAt: created,
      reviews: [],
      ...citeOf(exercise.cita, materials.inference),
      activityType: activity.type,
      activity: JSON.stringify(activity),
      hints: exercise.pistas,
      example: exercise.ejemplo,
      explanation: exercise.explicacion,
    };
  });
}

// «Cargar 10.000 tarjetas» (Ajustes › «Demostración», CA-103): tarjetas de relleno, nuevas, en una
// materia aparte llamada «Volumen» para no mezclarse con el elenco. El texto sale de una cuenta, no
// del azar: dos cargas dan exactamente las mismas tarjetas. Las palabras no repiten las que buscan
// las pruebas, así el relleno no compite con el elenco. Cargarlas otra vez no agrega nada.
const FILLER_WORDS = [
  'puente',
  'río',
  'montaña',
  'ciudad',
  'camino',
  'bosque',
  'isla',
  'valle',
  'desierto',
  'costa',
  'molino',
  'faro',
  'jardín',
  'mercado',
  'estación',
  'plaza',
  'torre',
  'castillo',
  'taller',
  'granja',
  'barco',
  'tren',
  'avión',
  'bicicleta',
  'carreta',
  'tractor',
  'motor',
  'rueda',
  'engranaje',
  'palanca',
  'cobre',
  'hierro',
  'madera',
  'vidrio',
  'piedra',
  'arcilla',
  'lana',
  'algodón',
  'papel',
  'tinta',
  'otoño',
  'invierno',
  'verano',
  'primavera',
  'tormenta',
  'brisa',
  'niebla',
  'nieve',
  'lluvia',
  'sol',
  'melodía',
  'ritmo',
  'acorde',
  'cuerda',
  'tambor',
  'flauta',
  'coro',
  'verso',
  'cuento',
  'novela',
  'pintura',
  'escultura',
  'dibujo',
  'mosaico',
  'vitral',
  'tapiz',
  'cerámica',
  'grabado',
  'fresco',
  'boceto',
  'receta',
  'harina',
  'levadura',
  'aceite',
  'vinagre',
  'miel',
  'sal',
  'pimienta',
  'canela',
  'azafrán',
  'ballena',
  'delfín',
  'águila',
  'zorro',
  'lobo',
  'ciervo',
  'abeja',
  'hormiga',
  'mariposa',
  'tortuga',
  'telescopio',
  'microscopio',
  'brújula',
  'reloj',
  'balanza',
  'espejo',
  'lente',
  'prisma',
  'imán',
  'péndulo',
  'volcán',
  'glaciar',
  'arrecife',
  'meseta',
  'cañón',
  'pantano',
  'estuario',
  'archipiélago',
  'península',
  'cráter',
  'idioma',
  'alfabeto',
  'sílaba',
  'palabra',
  'frase',
  'párrafo',
  'capítulo',
  'prólogo',
  'epílogo',
  'índice',
];

const VOLUME_SUBJECT = 'Volumen';
const VOLUME_TOPIC = 'Relleno';

export function seedDemoVolume(
  workspace: Workspace,
  count = 10_000,
): { subjectId: string; cards: number } {
  const existing = workspace.subjects.list().subjects.find((item) => item.name === VOLUME_SUBJECT);
  if (existing) {
    const present = workspace.cards.list({ subjectId: existing.id }).length;
    if (present > 0) {
      return { subjectId: existing.id, cards: present };
    }
  }
  const subject =
    existing ?? workspace.subjects.create({ name: VOLUME_SUBJECT, makeActive: false });
  const topic = workspace.topics.create(
    { subjectId: subject.id, name: VOLUME_TOPIC },
    { source: 'demo' },
  );
  const word = (index: number, slot: number) =>
    FILLER_WORDS[
      (index * 7919 + slot * 104_729 + Math.floor(index / 7) * 31) % FILLER_WORDS.length
    ] ?? FILLER_WORDS[0];
  const created = new Date(DEMO_NOW.getTime() - 30 * DAY_MS);
  const entries: SeedCard[] = [];
  for (let index = 0; index < count; index += 1) {
    const number = String(index + 1).padStart(5, '0');
    entries.push({
      question: `Relleno ${number}: ¿qué relación hay entre ${word(index, 1)} y ${word(index, 2)}?`,
      answer: `El ${word(index, 3)} ${word(index, 4)} se vincula con ${word(index, 5)} y con ${word(index, 6)}.`,
      kind: 'qa',
      subjectId: subject.id,
      topicId: topic.id,
      createdAt: created,
      reviews: [],
    });
  }
  workspace.cards.plantCast(entries);
  return { subjectId: subject.id, cards: count };
}
