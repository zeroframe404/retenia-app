import { z } from 'zod';

// Las reglas puras de la organización (Fase 07): materias, temas, renglones de una nota y qué se
// puede deshacer. Sin pantalla ni base de datos.

// --- Materias ---

// La lista cerrada de estados. Hay una sola materia activa.
export const SUBJECT_STATUSES = ['active', 'maintenance', 'paused', 'archived'] as const;
type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

// «Hacer activa»: la elegida queda activa y la que estaba activa pasa a mantenimiento. Las que
// estaban en pausa o archivadas no se tocan. Nunca queda más de una activa.
export function activateSubject<T extends { id: string; status: SubjectStatus }>(
  subjects: readonly T[],
  subjectId: string,
): T[] {
  if (!subjects.some((subject) => subject.id === subjectId)) {
    throw new Error('No encontré la materia');
  }
  return subjects.map((subject) => {
    if (subject.id === subjectId) {
      return subject.status === 'active' ? { ...subject } : { ...subject, status: 'active' };
    }
    return subject.status === 'active' ? { ...subject, status: 'maintenance' } : { ...subject };
  });
}

// --- Nombres ---

function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');
}

// El mismo nombre sin distinguir mayúsculas, espacios de los bordes ni espacios repetidos.
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

// Renombrar un tema: el nombre viejo pasa a «Otros nombres» (al final), salvo que sea el mismo
// nombre o ya esté; si el nuevo era uno de los otros nombres, ese deja de estarlo.
export function renameTopic(
  topic: { name: string; aliases: readonly string[] },
  newName: string,
): { name: string; aliases: string[] } {
  if (topic.name === newName) {
    return { name: topic.name, aliases: [...topic.aliases] };
  }
  const aliases: string[] = [];
  const addAlias = (alias: string) => {
    if (!sameName(alias, newName) && !aliases.some((kept) => sameName(kept, alias))) {
      aliases.push(alias);
    }
  };
  for (const alias of topic.aliases) {
    addAlias(alias);
  }
  addAlias(topic.name);
  return { name: newName, aliases };
}

// --- Renglones ---

// Lo que lleva un renglón por dentro: la misma forma que el contrato del puente.
export type InlineContent = readonly (
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'mention'; readonly id: string; readonly label: string }
  | {
      readonly type: 'image';
      readonly sha: string;
      readonly width: number;
      readonly height: number;
      readonly alt: string;
    }
)[];

// Los textos juntos; un enlace aporta su nombre y una imagen no aporta nada.
export function textPlainOf(content: InlineContent): string {
  let text = '';
  for (const node of content) {
    if (node.type === 'text') {
      text += node.text;
    } else if (node.type === 'mention') {
      text += node.label;
    }
  }
  return text;
}

// Las notas a las que enlaza un renglón, sin repetir y en el orden en que aparecen.
export function mentionIdsOf(content: InlineContent): string[] {
  const ids: string[] = [];
  for (const node of content) {
    if (node.type === 'mention' && !ids.includes(node.id)) {
      ids.push(node.id);
    }
  }
  return ids;
}

// El JSON con las claves ordenadas: dos contenidos iguales dan el mismo texto sin importar el
// orden en que se escribieron las claves.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface IncomingBlock {
  id: string;
  parentId: string | null;
  collapsed: boolean;
  content: InlineContent;
}

export interface StoredBlock extends IncomingBlock {
  // El lugar entre los hijos del mismo padre.
  position: number;
  deleted: boolean;
}

interface PlannedBlock extends IncomingBlock {
  position: number;
}

export interface BlockPlan {
  // Renglones que no estaban: fila y versión nuevas.
  created: PlannedBlock[];
  // Renglones borrados antes que volvieron a aparecer: se vuelven a ver (con todo lo suyo).
  revived: PlannedBlock[];
  // Los que cambiaron de contenido: versión nueva.
  edited: PlannedBlock[];
  // Los que cambiaron solo de padre o de lugar: no crean versión.
  moved: PlannedBlock[];
  // Los que cambiaron solo de plegado: no crean versión.
  folded: PlannedBlock[];
  // Los que estaban y ya no están: borrado lógico (las versiones se conservan).
  removed: string[];
}

// Compara lo que manda la ventana (en orden de lectura) con lo que hay guardado y dice qué
// escribir: solo lo que cambió.
export function planBlocks(
  existing: readonly StoredBlock[],
  incoming: readonly IncomingBlock[],
): BlockPlan {
  const stored = new Map(existing.map((block) => [block.id, block]));
  const plan: BlockPlan = {
    created: [],
    revived: [],
    edited: [],
    moved: [],
    folded: [],
    removed: [],
  };
  const siblings = new Map<string | null, number>();
  const kept = new Set<string>();
  for (const block of incoming) {
    kept.add(block.id);
    const position = siblings.get(block.parentId) ?? 0;
    siblings.set(block.parentId, position + 1);
    const planned: PlannedBlock = { ...block, position };
    const before = stored.get(block.id);
    if (before === undefined) {
      plan.created.push(planned);
      continue;
    }
    const contentChanged = canonicalJson(before.content) !== canonicalJson(block.content);
    if (contentChanged) {
      plan.edited.push(planned);
    }
    if (before.deleted) {
      plan.revived.push(planned);
      continue;
    }
    if (before.parentId !== block.parentId || before.position !== position) {
      plan.moved.push(planned);
    }
    if (before.collapsed !== block.collapsed) {
      plan.folded.push(planned);
    }
  }
  for (const block of existing) {
    if (!block.deleted && !kept.has(block.id)) {
      plan.removed.push(block.id);
    }
  }
  return plan;
}

// --- Deshacer ---

export type OrganizationOperationKind =
  | 'subject.activate'
  | 'topic.create'
  | 'topic.rename'
  | 'topic.archive'
  | 'topic.unarchive'
  | 'topic.delete'
  | 'topic.restore'
  | 'topic.purge'
  | 'note.create'
  | 'note.move'
  | 'note.archive'
  | 'note.unarchive'
  | 'note.delete'
  | 'note.restore'
  | 'note.purge'
  | 'inbox.delete'
  | 'inbox.restore'
  | 'inbox.purge';

export interface OrganizationOperation {
  readonly kind: OrganizationOperationKind;
  // La cosa sobre la que se hizo (la materia que se activó, la nota, el tema, el elemento).
  readonly entityId: string;
  readonly trashEntryId: string | null;
  // Lo que hace falta para deshacer (el tema de antes, el nombre de antes, la materia activa).
  readonly detail: unknown;
}

// Cómo está hoy lo que se cambió.
export interface TrashableSnapshot {
  readonly status: 'active' | 'trashed' | 'gone';
  // La entrada vigente de la Papelera, si está ahí.
  readonly activeTrashEntryId: string | null;
}

export interface NoteSnapshot extends TrashableSnapshot {
  readonly entity: 'note';
  readonly archived: boolean;
  // El tema en el que está hoy (nulo si no tiene).
  readonly topicId: string | null;
  // Un tema al que se puede volver: existe y no está en la Papelera.
  readonly isTopicAvailable: (topicId: string) => boolean;
}

export interface TopicSnapshot extends TrashableSnapshot {
  readonly entity: 'topic';
  readonly archived: boolean;
  readonly name: string;
  // Otro tema de la materia usa ese nombre.
  readonly isNameUsedByOther: (name: string) => boolean;
}

export interface InboxSnapshot extends TrashableSnapshot {
  readonly entity: 'inbox';
}

export interface SubjectSnapshot {
  readonly entity: 'subject';
  readonly activeSubjectId: string | null;
  // Una materia a la que se puede volver: existe y no está archivada.
  readonly isUsable: (subjectId: string) => boolean;
}

export type OrganizationSnapshot = NoteSnapshot | TopicSnapshot | InboxSnapshot | SubjectSnapshot;

export type OrganizationUndoPlan =
  | { readonly action: 'trash' }
  | { readonly action: 'restore-from-trash'; readonly trashEntryId: string }
  | { readonly action: 'archive' }
  | { readonly action: 'unarchive' }
  | { readonly action: 'move'; readonly topicId: string | null }
  | { readonly action: 'rename'; readonly name: string }
  | { readonly action: 'activate'; readonly subjectId: string };

const moveDetail = z.object({ from: z.string().nullable(), to: z.string().nullable() });
const renameDetail = z.object({ before: z.string(), after: z.string() });
const activateDetail = z.object({ previousActiveId: z.string().nullable() });

function restoreFromTrash(
  operation: OrganizationOperation,
  snapshot: TrashableSnapshot,
): OrganizationUndoPlan | null {
  return snapshot.status === 'trashed' &&
    operation.trashEntryId !== null &&
    snapshot.activeTrashEntryId === operation.trashEntryId
    ? { action: 'restore-from-trash', trashEntryId: operation.trashEntryId }
    : null;
}

const trashIfActive = (snapshot: TrashableSnapshot): OrganizationUndoPlan | null =>
  snapshot.status === 'active' ? { action: 'trash' } : null;

// Dice si lo que hizo una operación se puede deshacer hoy y qué hay que hacer. Se puede mientras
// la cosa siga como la dejó la operación; lo eliminado para siempre nunca se deshace.
export function undoOrganizationPlan(
  operation: OrganizationOperation,
  snapshot: OrganizationSnapshot,
): OrganizationUndoPlan | null {
  switch (operation.kind) {
    case 'note.create':
    case 'note.restore':
      return snapshot.entity === 'note' ? trashIfActive(snapshot) : null;
    case 'topic.create':
    case 'topic.restore':
      return snapshot.entity === 'topic' ? trashIfActive(snapshot) : null;
    case 'inbox.restore':
      return snapshot.entity === 'inbox' ? trashIfActive(snapshot) : null;
    case 'note.delete':
      return snapshot.entity === 'note' ? restoreFromTrash(operation, snapshot) : null;
    case 'topic.delete':
      return snapshot.entity === 'topic' ? restoreFromTrash(operation, snapshot) : null;
    case 'inbox.delete':
      return snapshot.entity === 'inbox' ? restoreFromTrash(operation, snapshot) : null;
    case 'note.archive':
      return snapshot.entity === 'note' && snapshot.status === 'active' && snapshot.archived
        ? { action: 'unarchive' }
        : null;
    case 'note.unarchive':
      return snapshot.entity === 'note' && snapshot.status === 'active' && !snapshot.archived
        ? { action: 'archive' }
        : null;
    case 'topic.archive':
      return snapshot.entity === 'topic' && snapshot.status === 'active' && snapshot.archived
        ? { action: 'unarchive' }
        : null;
    case 'topic.unarchive':
      return snapshot.entity === 'topic' && snapshot.status === 'active' && !snapshot.archived
        ? { action: 'archive' }
        : null;
    case 'note.move': {
      const detail = moveDetail.safeParse(operation.detail);
      if (!detail.success || snapshot.entity !== 'note' || snapshot.status !== 'active') {
        return null;
      }
      const { from, to } = detail.data;
      return snapshot.topicId === to && (from === null || snapshot.isTopicAvailable(from))
        ? { action: 'move', topicId: from }
        : null;
    }
    case 'topic.rename': {
      const detail = renameDetail.safeParse(operation.detail);
      if (!detail.success || snapshot.entity !== 'topic' || snapshot.status !== 'active') {
        return null;
      }
      const { before, after } = detail.data;
      return snapshot.name === after && !snapshot.isNameUsedByOther(before)
        ? { action: 'rename', name: before }
        : null;
    }
    case 'subject.activate': {
      const detail = activateDetail.safeParse(operation.detail);
      if (!detail.success || snapshot.entity !== 'subject') {
        return null;
      }
      const { previousActiveId } = detail.data;
      return previousActiveId !== null &&
        snapshot.activeSubjectId === operation.entityId &&
        snapshot.isUsable(previousActiveId)
        ? { action: 'activate', subjectId: previousActiveId }
        : null;
    }
    case 'note.purge':
    case 'topic.purge':
    case 'inbox.purge':
      return null;
  }
}
