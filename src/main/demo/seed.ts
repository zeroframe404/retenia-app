import { z } from 'zod';
import cast from '../../../datos-de-ejemplo/elenco/materias.json';
import sample from '../../../datos-de-ejemplo/elenco/tarjetas-minimas.json';
import type { IncomingBlock } from '../../core/organization';
import type { CardsStore } from '../../data/cards';
import { newId } from '../../data/ids';
import type { Workspace } from '../../data/workspace';
import { cardsCreateRequest } from '../../preload/contract/cards';
import type { InlineNode } from '../../preload/contract/notes';

// Las tres tarjetas de ejemplo de la Fase 03 (el elenco completo se arma en las fases
// siguientes). Se siembran una sola vez, en una base que nunca tuvo tarjetas ni cambios (así
// vaciar la papelera no las vuelve a sembrar); la primera del archivo queda primera en la lista.
// Sus altas quedan anotadas como del ejemplo y no aparecen en «Actividad reciente». Nada se
// ejecuta al cargar el módulo: así, en la versión real, el empaquetador descarta este archivo y
// el JSON de ejemplo con él. Devuelve cuántas tarjetas sembró (cero si no correspondía).
export function seedDemoCards(store: CardsStore): number {
  if (!store.isPristine()) {
    return 0;
  }
  const cards = z.array(cardsCreateRequest).length(3).parse(sample);
  for (const card of [...cards].reverse()) {
    store.create(card, { source: 'demo' });
  }
  return cards.length;
}

// El elenco de la Fase 07 (datos-de-ejemplo/elenco/materias.json): materias, temas y notas con
// contenido real. Cada renglón es una lista de partes: texto, enlace a otra nota (por su título) o
// imagen (por su nombre en «images», siempre un PNG).
const part = z.union([
  z.strictObject({ text: z.string().min(1) }),
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
    workspace.notes.save({ noteId, title: note.title, blocks });
  }

  workspace.subjects.createExample({ activate: false }, { source: 'demo' });
  return workspace.subjects.count();
}
