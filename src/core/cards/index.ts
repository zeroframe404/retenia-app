import { canonicalJson } from '../organization';

// Las reglas puras de las tarjetas que nacen dentro de un renglón (H-12), de su ficha (H-13) y de la
// lista (H-14). Sin pantalla ni base de datos.
//
// La identidad de una tarjeta nunca depende de su texto: una tarjeta de pregunta y respuesta es «la
// del renglón» y una de completar es «la del hueco» (cada hueco lleva su identificador).

// Lo que lleva un renglón por dentro, ahora con huecos.
type RowNode =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'mention'; readonly id: string; readonly label: string }
  | {
      readonly type: 'image';
      readonly sha: string;
      readonly width: number;
      readonly height: number;
      readonly alt: string;
    }
  | { readonly type: 'cloze'; readonly id: string; readonly text: string };
export type RowContent = readonly RowNode[];

export const HOLE_PLACEHOLDER = '[...]';
const ARROW = '>>';

// --- Reconocimiento ---

export interface Hole {
  // Dónde empieza la «{{» y dónde termina la «}}» (el final no entra).
  readonly start: number;
  readonly end: number;
  readonly inner: string;
}

// Los huecos «{{…}}» de un texto, en orden. Un hueco vacío o de solo espacios no cuenta; con
// llaves anidadas queda el de adentro.
export function findHoles(text: string): Hole[] {
  const holes: Hole[] = [];
  for (const match of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const inner = match[1] ?? '';
    if (inner.trim() !== '') {
      holes.push({ start: match.index, end: match.index + match[0].length, inner });
    }
  }
  return holes;
}

// «pregunta >> respuesta»: parte en la primera flecha (una segunda queda dentro de la respuesta).
// Sin flecha, o con un lado en blanco, no es una tarjeta.
export function splitArrow(text: string): { question: string; answer: string } | null {
  const at = text.indexOf(ARROW);
  if (at === -1) {
    return null;
  }
  const question = text.slice(0, at).trim();
  const answer = text.slice(at + ARROW.length).trim();
  return question === '' || answer === '' ? null : { question, answer };
}

// --- Qué tarjetas salen de un renglón ---

export interface CardSpec {
  // «qa» para la tarjeta del renglón o el identificador del hueco.
  readonly key: string;
  readonly kind: 'qa' | 'cloze';
  readonly clozeId: string | null;
  readonly question: RowContent;
  readonly answer: RowContent;
}

const isBlank = (nodes: RowContent) =>
  nodes.every((node) => node.type === 'text' && node.text.trim() === '');

// Junta los textos que quedaron seguidos.
function merge(nodes: RowContent): RowNode[] {
  const merged: RowNode[] = [];
  for (const node of nodes) {
    const last = merged.at(-1);
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

// Saca los espacios de los bordes del primero y del último texto y descarta lo que queda vacío.
function trimEnds(nodes: RowContent): RowNode[] {
  const copy = [...merge(nodes)];
  const first = copy[0];
  if (first?.type === 'text') {
    copy[0] = { type: 'text', text: first.text.trimStart() };
  }
  const last = copy.at(-1);
  if (last?.type === 'text') {
    copy[copy.length - 1] = { type: 'text', text: last.text.trimEnd() };
  }
  return copy.filter((node) => node.type !== 'text' || node.text !== '');
}

function clozeSpecs(content: RowContent): CardSpec[] {
  const holes = content.filter(
    (node): node is Extract<RowNode, { type: 'cloze' }> =>
      node.type === 'cloze' && node.text.trim() !== '',
  );
  return holes.map((hole) => {
    const question = content.map((node): RowNode => {
      if (node.type !== 'cloze') {
        return node;
      }
      return { type: 'text', text: node === hole ? HOLE_PLACEHOLDER : node.text };
    });
    return {
      key: hole.id,
      kind: 'cloze',
      clozeId: hole.id,
      question: trimEnds(question),
      answer: [{ type: 'text', text: hole.text.trim() }],
    };
  });
}

function arrowSpec(content: RowContent): CardSpec | null {
  const at = content.findIndex((node) => node.type === 'text' && node.text.includes(ARROW));
  const node = content[at];
  if (node?.type !== 'text') {
    return null;
  }
  const cut = node.text.indexOf(ARROW);
  const question = trimEnds([
    ...content.slice(0, at),
    { type: 'text', text: node.text.slice(0, cut) },
  ]);
  const answer = trimEnds([
    { type: 'text', text: node.text.slice(cut + ARROW.length) },
    ...content.slice(at + 1),
  ]);
  if (isBlank(question) || isBlank(answer)) {
    return null;
  }
  return { key: 'qa', kind: 'qa', clozeId: null, question, answer };
}

// Las tarjetas que pide un renglón. Si tiene huecos, mandan los huecos (una tarjeta hermana por
// cada uno); si no, la flecha; si no, ninguna.
export function rowCardSpecs(content: RowContent): CardSpec[] {
  const holes = clozeSpecs(content);
  if (holes.length > 0) {
    return holes;
  }
  const arrow = arrowSpec(content);
  return arrow === null ? [] : [arrow];
}

// Cómo se marca un renglón en el editor: nada si no es tarjeta.
export function rowCardKind(content: RowContent): 'qa' | 'cloze' | null {
  return rowCardSpecs(content)[0]?.kind ?? null;
}

// El texto de un contenido, para mostrarlo en una lista.
export function plainOfContent(content: RowContent): string {
  let text = '';
  for (const node of content) {
    if (node.type === 'text' || node.type === 'cloze') {
      text += node.text;
    } else if (node.type === 'mention') {
      text += node.label;
    }
  }
  return text;
}

// --- Ligar la tarjeta al renglón ---

export interface ExistingRowCard {
  readonly cardId: string;
  readonly clozeId: string | null;
  readonly question: RowContent;
  readonly answer: RowContent;
  // Eliminada por vos (en la Papelera, sin que el renglón la haya soltado).
  readonly trashed: boolean;
  // El renglón dejó de pedirla.
  readonly detached: boolean;
  readonly hasHistory: boolean;
}

export interface ReconcilePlan {
  create: CardSpec[];
  update: { cardId: string; spec: CardSpec }[];
  reattach: { cardId: string; spec: CardSpec }[];
  lost: { cardId: string; hasHistory: boolean }[];
}

const keyOf = (card: { clozeId: string | null }) => card.clozeId ?? 'qa';

const sameContent = (a: RowContent, b: RowContent) => canonicalJson(a) === canonicalJson(b);

// Compara lo que pide el renglón con las tarjetas que ya tiene (por identificador de hueco, o «la del
// renglón»; nunca por texto) y dice qué hacer.
export function reconcileRowCards(
  existing: readonly ExistingRowCard[],
  specs: readonly CardSpec[],
): ReconcilePlan {
  const plan: ReconcilePlan = { create: [], update: [], reattach: [], lost: [] };
  const byKey = new Map(existing.map((card) => [keyOf(card), card]));
  const wanted = new Set(specs.map((spec) => spec.key));
  for (const spec of specs) {
    const card = byKey.get(spec.key);
    if (card === undefined) {
      plan.create.push(spec);
    } else if (card.trashed && !card.detached) {
      // La eliminaste vos: el renglón no la trae de vuelta.
    } else if (card.detached) {
      plan.reattach.push({ cardId: card.cardId, spec });
    } else if (
      !sameContent(card.question, spec.question) ||
      !sameContent(card.answer, spec.answer)
    ) {
      plan.update.push({ cardId: card.cardId, spec });
    }
  }
  for (const card of existing) {
    if (!wanted.has(keyOf(card)) && !card.detached && !card.trashed) {
      plan.lost.push({ cardId: card.cardId, hasHistory: card.hasHistory });
    }
  }
  return plan;
}

// --- La ficha ---

export const SHEET_STATES = ['proposed', 'reviewed', 'verified', 'in_review', 'retired'] as const;
export type SheetState = (typeof SHEET_STATES)[number];
// Los que vos podés elegir: «Propuesta» es de la IA.
export const USER_SHEET_STATES = ['reviewed', 'verified', 'in_review', 'retired'] as const;
const FORM_TYPES = ['exact', 'meaning'] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const MAX_ESSENTIALS = 4;
export const MAX_HINTS = 3;

class SheetLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetLimitError';
  }
}

// Una tarjeta creada a mano (o escrita en una nota) nace «Revisada»; «Propuesta» es solo de la IA.
export function initialSheetState(origin: 'manual' | 'note' | 'import' | 'ai'): SheetState {
  return origin === 'ai' ? 'proposed' : 'reviewed';
}

export interface Sheet {
  referenceAnswer: string;
  variants: string[];
  essentials: string[];
  hints: string[];
  explanation: string;
  source: string;
  formType: FormType;
  state: SheetState;
}

const cleanList = (list: readonly string[] | undefined) =>
  (list ?? []).map((item) => item.trim()).filter((item) => item !== '');

// Lo que se manda al guardar la ficha: solo los campos que cambian.
export type SheetInput = { [K in keyof Sheet]?: Sheet[K] | undefined };

// La ficha con los cambios puestos (lo que no viene queda como estaba).
export function mergeSheet(base: Sheet, patch: SheetInput): Sheet {
  return {
    referenceAnswer: patch.referenceAnswer ?? base.referenceAnswer,
    variants: patch.variants ?? base.variants,
    essentials: patch.essentials ?? base.essentials,
    hints: patch.hints ?? base.hints,
    explanation: patch.explanation ?? base.explanation,
    source: patch.source ?? base.source,
    formType: patch.formType ?? base.formType,
    state: patch.state ?? base.state,
  };
}

// Deja la ficha como se guarda: sin espacios de los bordes, sin renglones vacíos y con los topes.
export function normalizeSheet(input: SheetInput): SheetInput {
  const result: SheetInput = { ...input };
  if (input.variants !== undefined) {
    result.variants = cleanList(input.variants);
  }
  if (input.essentials !== undefined) {
    result.essentials = cleanList(input.essentials);
    if (result.essentials.length > MAX_ESSENTIALS) {
      throw new SheetLimitError(`Hasta ${MAX_ESSENTIALS} componentes esenciales`);
    }
  }
  if (input.hints !== undefined) {
    result.hints = cleanList(input.hints);
    if (result.hints.length > MAX_HINTS) {
      throw new SheetLimitError(`Hasta ${MAX_HINTS} pistas`);
    }
  }
  for (const key of ['referenceAnswer', 'explanation', 'source'] as const) {
    if (input[key] !== undefined) {
      result[key] = input[key].trim();
    }
  }
  return result;
}

// «¿Cambió lo que hay que recordar?»: se pregunta si la tarjeta tiene historial y cambió su pregunta
// o su respuesta.
export function needsMeaningQuestion(
  before: { question: string; answer: string },
  after: { question: string; answer: string },
  hasHistory: boolean,
): boolean {
  return hasHistory && (before.question !== after.question || before.answer !== after.answer);
}

// --- La lista ---

export interface CardFilter {
  // Un tema, «none» para las que no tienen, o nada para todos.
  topicId?: string | null | undefined;
  sheetState?: SheetState | null | undefined;
  kind?: 'qa' | 'cloze' | null | undefined;
}

export function matchesFilter(
  card: { topicId: string | null; sheetState: SheetState; kind: 'qa' | 'cloze' },
  filter: CardFilter,
): boolean {
  if (filter.topicId !== undefined && filter.topicId !== null) {
    if (filter.topicId === 'none' ? card.topicId !== null : card.topicId !== filter.topicId) {
      return false;
    }
  }
  if (filter.sheetState && card.sheetState !== filter.sheetState) {
    return false;
  }
  return !(filter.kind && card.kind !== filter.kind);
}
