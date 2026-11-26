import { and, count, desc, eq, isNull, like } from 'drizzle-orm';
import {
  matchesFilter,
  mergeSheet,
  needsMeaningQuestion,
  normalizeSheet,
  type Sheet,
  USER_SHEET_STATES,
} from '../core/cards';
import type { Clock } from '../core/clock';
import {
  type Activity,
  type HelpUse,
  helpLevelOf,
  maxHelpLevel,
  purposeOf,
  referenceText,
  validateActivity,
} from '../core/evaluation';
import { SET_ACTIVITIES, setProblems } from '../core/interleave';
import { newCardsCost } from '../core/load';
import { type DueExplanation, type Grade, type HelpLevel, verdictOfGrade } from '../core/memory';
import { canonicalJson } from '../core/organization';
import { studyDayOf } from '../core/study-day';
import type {
  ActivityModeValue,
  ActivityValue,
  HelpUseValue,
} from '../preload/contract/activities';
import type {
  ActivationCost,
  Card,
  CardDetail,
  CardHistory,
  CardSheetInput,
  SheetStateValue,
} from '../preload/contract/cards';
import { texts } from '../preload/contract/texts';
import {
  CardOutOfReviewsError,
  CardPausedError,
  InverseNotAllowedError,
  LinkedCardTextError,
  MeaningQuestionRequiredError,
  ReviewNotFoundError,
  SheetStateNotAllowedError,
} from './card-errors';
import {
  activeCard,
  CardNotFoundError,
  type CardRow,
  cardOf,
  findCard,
  hasHistoryOf,
  parseContent,
  selectCards,
  sheetOf,
  toCard,
  trashCard,
} from './content';
import type { ReteniaDatabase } from './database';
import {
  plantAttempt,
  plantCard,
  plantHistoryOf,
  type SeedAttempt,
  type SeedCard,
  type SeedReview,
} from './demo-cards';
import { newId } from './ids';
import {
  appendEvaluation,
  appendObservation,
  appendOperation,
  type EventSource,
  readPayload,
} from './ledger';
import { estimatesOf } from './load';
import { describeCite } from './materials';
import { SubjectNotFoundError, TopicNotFoundError } from './organization-errors';
import type { Writer } from './orm';
import { plannedDayOf } from './postponements';
import {
  cardHistory,
  pendingCheckOf,
  recomputeCardSchedule,
  reviewFacts,
  whyToday,
} from './projections';
import {
  blocks,
  cardSchedule,
  cards,
  cardVersions,
  notes,
  observations,
  operations,
  subjects,
  topics,
} from './schema';

export { CardNotFoundError };

// El mismo intento llegó con otra tarjeta: no es un repaso repetido, es un pedido equivocado.
class AttemptConflictError extends Error {
  constructor() {
    super('Ese repaso ya se guardó con otra tarjeta');
    this.name = 'AttemptConflictError';
  }
}

interface ListInput {
  subjectId?: string | undefined;
  topicId?: string | undefined;
  sheetState?: SheetStateValue | undefined;
  kind?: 'qa' | 'cloze' | 'exercise' | undefined;
}

// La actividad no cumple lo que pide su editor (Fase 16): opciones, pasos o unidades de más o de
// menos, sin explicación en una opción equivocada…
class InvalidActivityError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`La actividad no es válida: ${problems.join(', ')}`);
    this.name = 'InvalidActivityError';
    this.problems = problems;
  }
}

function activityJson(activity: Activity | null | undefined): {
  activityType: string | null;
  activity: string | null;
} {
  if (activity === null || activity === undefined) {
    return { activityType: null, activity: null };
  }
  const problems = validateActivity(activity);
  if (problems.length > 0) {
    throw new InvalidActivityError(problems);
  }
  return { activityType: activity.type, activity: JSON.stringify(activity) };
}

// Todo lo que un problema puede mostrar como enunciado: su pregunta y los de sus variantes.
export function shownStatements(row: { question: string; activity: string | null }): string {
  const activity = parsedActivity(row);
  const family = activity?.type === 'numeric' ? activity.family : null;
  return [row.question, ...(family?.statements ?? [])].join(' ¦ ');
}

// Un conjunto intercalado (CA-162): sus problemas son ejercicios de la misma materia y ninguno
// nombra un tipo en el enunciado.
function assertSetProblems(tx: Writer, activity: Activity, subjectId: string | null): void {
  if (activity.type !== 'interleaved') {
    return;
  }
  const subjectsOf = new Map<string, string | null>();
  const statements = new Map<string, string>();
  for (const cardId of activity.types.flatMap((type) => type.cardIds)) {
    const row = findCard(tx, cardId);
    if (!row || row.deletedAt !== null) {
      throw new InvalidActivityError(['typesEmpty']);
    }
    if (!SET_ACTIVITIES.includes(row.activityType ?? '')) {
      throw new InvalidActivityError(['unsupported']);
    }
    subjectsOf.set(cardId, row.subjectId);
    statements.set(cardId, shownStatements(row));
  }
  const problems = setProblems(activity.types, { subjects: subjectsOf, statements });
  if ([...subjectsOf.values()].some((own) => own !== subjectId)) {
    problems.push('subjects');
  }
  if (problems.length > 0) {
    throw new InvalidActivityError(problems);
  }
}

function answerFor(activity: Activity | null | undefined, given: string): string {
  // Con variantes no hay una respuesta fija (y la cuenta no es para mostrar).
  if (activity?.type === 'numeric' && activity.family) {
    return texts.cards.variantAnswer;
  }
  return activity ? (referenceText(activity) ?? given) : given;
}

// El procedimiento y el conjunto son siempre de práctica: la escalera ya decide cuánta ayuda hay.
const alwaysPractice = (activityType: string | null | undefined) =>
  activityType === 'procedure' || activityType === 'interleaved';

export function parsedActivity(row: { activity: string | null }): ActivityValue | null {
  return row.activity === null ? null : (JSON.parse(row.activity) as ActivityValue);
}

export const asMode = (value: string): ActivityModeValue =>
  value === 'evaluation' ? 'evaluation' : 'practice';

export interface CardsStore {
  create(
    input: {
      question: string;
      answer: string;
      subjectId?: string | null | undefined;
      topicId?: string | null | undefined;
      // Fase 16: un ejercicio, con su ficha de una vez.
      activity?: Activity | null | undefined;
      sheet?: CardSheetInput | undefined;
      example?: string | undefined;
      mode?: ActivityModeValue | undefined;
    },
    options?: { source?: EventSource },
  ): Card;
  // Una tarjeta que sale de un material (Fase 13, «Crear tarjeta desde acá»): lleva la fuente
  // legible en la ficha («Fuente: …») y la cita anclada.
  createFromMaterial(input: {
    question: string;
    answer: string;
    subjectId: string;
    sourceText: string;
    sourceCite: string;
  }): Card;
  list(input?: ListInput): Card[];
  // La cita de un material de la versión vigente (JSON), o null.
  sourceCite(cardId: string): string | null;
  // Cambia solo la cita de la fuente de una tarjeta (Fase 14: el texto del material se corrigió).
  // La pregunta y la respuesta no se tocan; queda una versión nueva.
  updateSource(input: { cardId: string; sourceCite: string }): void;
  // Las tarjetas (no borradas) cuya versión vigente cita ese material.
  citing(materialId: string): { cardId: string; question: string; sourceCite: string }[];
  // La lista filtrada y cuántas tiene la materia sin filtrar.
  listWithTotal(input?: ListInput): { cards: Card[]; total: number };
  get(input: { cardId: string }): CardDetail;
  // Un repaso. `helpLevel` es la ayuda que se usó (A0 si no se dice); las pistas llegan con su fase.
  review(input: {
    cardId: string;
    grade: Grade;
    attemptId: string;
    helpLevel?: HelpLevel | undefined;
    // Fase 16: cada ayuda usada con «Practicar ahora» y «No sé por dónde empezar».
    help?: readonly HelpUseValue[] | undefined;
    noIdea?: boolean | undefined;
  }): Card;
  // «Deshacer» el repaso recién hecho (CA-063): queda en el historial como «Anulado» y la agenda
  // vuelve a ser la de antes. Deshacerlo dos veces no agrega nada.
  undoReview(input: { cardId: string; attemptId: string }): Card;
  // «¿Por qué hoy?» (CA-065).
  whyToday(input: { cardId: string }): DueExplanation;
  // Editar la tarjeta y su ficha. Con historial, cambiar la pregunta o la respuesta exige contestar
  // «¿Cambió lo que hay que recordar?» (`meaningChanged`).
  edit(input: {
    cardId: string;
    question: string;
    answer: string;
    sheet?: CardSheetInput | undefined;
    meaningChanged?: boolean | undefined;
    // Fase 16: el tipo de actividad (nulo para volver a la tarjeta de siempre), el ejemplo y el modo.
    activity?: Activity | null | undefined;
    example?: string | undefined;
    // Fase 17: la edición viene de «Mejorar la tarjeta» («Reformular» o «Agregar una pista»): los
    // fallos de la dificultad recurrente se cuentan desde esta versión.
    improve?: 'rephrase' | 'hint' | undefined;
    mode?: ActivityModeValue | undefined;
  }): CardDetail;
  // «Dividir en dos» (Fase 17, «Mejorar la tarjeta»): dos tarjetas nuevas en el mismo lugar y con
  // el mismo objetivo, y la original retirada con su historial. `splitId`: el mismo pedido dos veces
  // no crea otras dos.
  split(input: {
    splitId: string;
    cardId: string;
    parts: readonly { question: string; answer: string }[];
  }): { cardIds: string[] };
  // Después de un cambio hecho en la nota: la tarjeta se programa como nueva.
  markMeaningChanged(input: { cardId: string }): Card;
  setPaused(input: { cardId: string; paused: boolean }): Card;
  // «Crear inversa»: una hermana con la pregunta y la respuesta cambiadas.
  createInverse(input: { cardId: string }): { card: Card; created: boolean };
  // «Eliminar»: a la Papelera por 30 días.
  remove(input: { cardId: string }): { trashEntryId: string };
  history(input: { cardId: string }): CardHistory;
  // «Sumar a mis repasos» (Fase 11): cuánto suman al repaso esas tarjetas, antes de confirmar, y
  // pasarlas al principio de las nuevas. Una tarjeta que ya se repasó no cuenta.
  activationCost(input: { count: number }): ActivationCost;
  activate(input: { batchId: string; cardIds: readonly string[] }): { activated: number };
  count(): number;
  // Solo para la demostración: tarjetas sueltas con su historial, y el historial de una que nació
  // en una nota. Devuelven cuántas tarjetas hay después.
  plantCast(entries: readonly SeedCard[]): number;
  // Lo que está mal en un ejercicio antes de guardarlo (Fase 18).
  validateActivity(input: { activity: Activity; subjectId: string | null }): {
    problems: string[];
  };
  // Intentos de otros días sobre ejercicios, solo de la demostración (Fase 18).
  plantAttempts(attempts: readonly SeedAttempt[]): void;
  plantHistory(
    entries: readonly { cardId: string; createdAt: Date; reviews: readonly SeedReview[] }[],
  ): void;
  // ¿Hay alguna tarjeta que escribiste en Tarjetas (no nacida en una nota)?
  hasManualCards(): boolean;
  // Nunca tuvo tarjetas ni cambios: recién ahí se siembra el ejemplo de la demostración.
  isPristine(): boolean;
}

function assertPlace(tx: Writer, subjectId: string | null, topicId: string | null): void {
  if (subjectId !== null) {
    const subject = tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
      .get();
    if (!subject) {
      throw new SubjectNotFoundError();
    }
  }
  if (topicId !== null) {
    const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
    if (!topic || topic.deletedAt !== null || topic.subjectId !== subjectId) {
      throw new TopicNotFoundError();
    }
  }
}

function listCards(db: Writer, input: ListInput): { cards: Card[]; total: number } {
  const rows = selectCards(db)
    .where(
      input.subjectId === undefined
        ? isNull(cards.deletedAt)
        : and(isNull(cards.deletedAt), eq(cards.subjectId, input.subjectId)),
    )
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .all();
  const filter = {
    topicId: input.topicId,
    sheetState: input.sheetState,
    kind: input.kind,
  };
  const shown = rows.map(toCard).filter((card) => matchesFilter(card, filter));
  // El contador cuenta tarjetas: los ejercicios se listan y no suman (Fase 16).
  return { cards: shown, total: rows.filter((row) => row.activityType === null).length };
}

// ¿El renglón de la tarjeta sigue ahí y la pide? Si la nota está en la Papelera o ya no existe, la
// tarjeta se edita como una suelta.
function isTiedToRow(db: Writer, row: CardRow): boolean {
  if (
    row.origin !== 'note' ||
    row.detachedAt !== null ||
    row.noteId === null ||
    row.blockId === null
  ) {
    return false;
  }
  const note = db
    .select({ deletedAt: notes.deletedAt })
    .from(notes)
    .where(eq(notes.id, row.noteId))
    .get();
  const block = db
    .select({ deletedAt: blocks.deletedAt })
    .from(blocks)
    .where(eq(blocks.id, row.blockId))
    .get();
  return (
    note !== undefined && note.deletedAt === null && block !== undefined && block.deletedAt === null
  );
}

function detailOf(db: Writer, row: CardRow): CardDetail {
  const subject =
    row.subjectId === null
      ? undefined
      : db
          .select({ name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, row.subjectId))
          .get();
  const note =
    row.noteId === null
      ? undefined
      : db
          .select({ id: notes.id, title: notes.title, deletedAt: notes.deletedAt })
          .from(notes)
          .where(eq(notes.id, row.noteId))
          .get();
  const block =
    row.blockId === null
      ? undefined
      : db
          .select({ deletedAt: blocks.deletedAt })
          .from(blocks)
          .where(eq(blocks.id, row.blockId))
          .get();
  const canOpenNote =
    row.detachedAt === null &&
    note !== undefined &&
    note.deletedAt === null &&
    block !== undefined &&
    block.deletedAt === null;
  const inverse = db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.inverseOfCardId, row.id), isNull(cards.deletedAt)))
    .get();
  return {
    ...toCard(row),
    questionContent: parseContent(row.questionContent) ?? [{ type: 'text', text: row.question }],
    answerContent: parseContent(row.answerContent) ?? [{ type: 'text', text: row.answer }],
    sheet: sheetOf(row),
    path: {
      subjectName: subject?.name ?? null,
      topicName: row.topicName,
      noteTitle: canOpenNote ? (note?.title ?? null) : null,
      noteId: canOpenNote ? row.noteId : null,
      blockId: canOpenNote ? row.blockId : null,
      canOpenNote,
    },
    siblingGroupId: row.siblingGroupId,
    inverseOfCardId: row.inverseOfCardId,
    hasInverse: inverse !== undefined,
    linked: row.origin === 'note' && canOpenNote,
    detached: row.detachedAt !== null,
    hasHistory: hasHistoryOf(db, row.id),
    cite: describeCite(db, row.sourceCite, row.id),
    activity: parsedActivity(row),
    example: row.example,
    mode: asMode(row.mode),
    pendingCheck: pendingCheckOf(db, row.id),
  };
}

// Una ficha vacía, para una tarjeta nueva.
const EMPTY_SHEET: Sheet = {
  referenceAnswer: '',
  variants: [],
  essentials: [],
  hints: [],
  explanation: '',
  source: '',
  formType: 'exact',
  state: 'reviewed',
};

// La ficha como columnas de la versión.
function sheetColumns(sheet: Sheet) {
  return {
    referenceAnswer: sheet.referenceAnswer,
    variants: JSON.stringify(sheet.variants),
    essentials: JSON.stringify(sheet.essentials),
    hints: JSON.stringify(sheet.hints),
    explanation: sheet.explanation,
    sourceText: sheet.source,
    formType: sheet.formType,
    sheetState: sheet.state,
  };
}

// Las listas de la ficha, como se comparan para saber si algo cambió.
const sheetKey = (sheet: Sheet) => canonicalJson(sheet);

// Lo que agrega un repaso hecho en una sesión de estudio (Fase 10).
export interface SessionReviewFacts {
  sessionId: string;
  activityId: string;
  retry: boolean;
  retryActivityId: string | null;
  answer: string | null;
  shownAt: string | null;
  firstInteractionMs: number | null;
  answerRequestedMs: number | null;
  gradedMs: number | null;
  activeMs: number;
}

// Un repaso dentro de la transacción de quien llama: la observación (con la clave del intento),
// su evaluación y la agenda recalculada. Si el intento ya estaba guardado no agrega nada; si estaba
// guardado con otra tarjeta, es un pedido equivocado. Lo usan el repaso de «Tarjetas» y la sesión.
export function recordReview(
  tx: Writer,
  clock: Clock,
  fuzz: boolean,
  input: {
    cardId: string;
    grade: Grade;
    attemptId: string;
    helpLevel?: HelpLevel | undefined;
    session?: SessionReviewFacts | undefined;
    // Fase 16: cada ayuda usada (el nivel sale de la más alta) y «No sé por dónde empezar».
    help?: readonly HelpUse[] | undefined;
    noIdea?: boolean | undefined;
  },
): { id: string; inserted: boolean } {
  const { cardId, grade, attemptId } = input;
  // El nivel de cada ayuda sale de su tipo y su número de pista, no de lo que mande la ventana.
  const help = input.help?.map((use) => ({
    ...use,
    level: helpLevelOf({ kind: use.kind, index: use.index }),
  }));
  const helpLevel = help === undefined ? (input.helpLevel ?? 'A0') : maxHelpLevel(help);
  const current = activeCard(tx, cardId);
  if (current.pausedAt !== null) {
    throw new CardPausedError();
  }
  if (current.sheetState === 'in_review' || current.sheetState === 'retired') {
    throw new CardOutOfReviewsError();
  }
  const observation = appendObservation(tx, clock, {
    kind: 'review.graded',
    payload: {
      cardId,
      grade,
      helpLevel,
      dueAtThen: current.dueAt,
      versionId: current.versionId,
      // Las tres fechas del repaso: la sugerida, la planificada (si se pospuso) y la real, que es
      // cuando se hizo. Solo la real alimenta al motor.
      suggestedDay: studyDayOf(new Date(current.dueAt)),
      plannedDay: plannedDayOf(tx, cardId) ?? studyDayOf(new Date(current.dueAt)),
      ...reviewFacts(tx, cardId, clock.now(), fuzz),
      ...(input.session ?? {}),
      ...(help === undefined
        ? {}
        : {
            help,
            noIdea: input.noIdea === true,
            purpose: purposeOf({ mode: asMode(current.mode), used: help, attemptNo: 1 }),
          }),
    },
    idempotencyKey: `review:${attemptId}`,
    source: 'user',
  });
  if (observation.inserted) {
    appendEvaluation(tx, clock, {
      attemptId: observation.id,
      verdict: verdictOfGrade(grade),
      source: 'user',
    });
    recomputeCardSchedule(tx, cardId);
  } else {
    // Un repaso repetido vale solo si es de la misma tarjeta.
    const saved = tx
      .select({ cardId: observations.cardId })
      .from(observations)
      .where(eq(observations.id, observation.id))
      .get();
    if (saved?.cardId !== cardId) {
      throw new AttemptConflictError();
    }
  }
  return observation;
}

// «Deshacer» un repaso dentro de la transacción de quien llama: lo anula (deshacerlo dos veces no
// agrega nada) y recalcula la agenda.
export function annulReview(
  tx: Writer,
  clock: Clock,
  input: { cardId: string; reviewId: string; sessionId?: string; activeMs?: number },
): void {
  appendObservation(tx, clock, {
    kind: 'review.annulled',
    payload: input,
    idempotencyKey: `annul:${input.reviewId}`,
    source: 'user',
  });
  recomputeCardSchedule(tx, input.cardId);
}

// «La tarjeta está mal» (CA-077): una versión nueva de la tarjeta con la ficha «En revisión»
// (causa «flagged»), con su operación en «Actividad reciente». Devuelve la versión.
export function flagCardVersion(tx: Writer, clock: Clock, cardId: string): string {
  const current = activeCard(tx, cardId);
  const previous = tx
    .select()
    .from(cardVersions)
    .where(eq(cardVersions.id, current.versionId))
    .get();
  if (!previous) {
    throw new CardNotFoundError();
  }
  if (previous.sheetState === 'in_review') {
    return previous.id;
  }
  const versionId = newId();
  tx.insert(cardVersions)
    .values({
      ...previous,
      id: versionId,
      sheetState: 'in_review',
      createdAt: clock.now().toISOString(),
      cause: 'flagged',
    })
    .run();
  tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
  appendOperation(tx, clock, {
    kind: 'card.edit',
    entityId: cardId,
    versionBeforeId: current.versionId,
    versionAfterId: versionId,
    source: 'user',
  });
  return versionId;
}

// Cada cambio pasa por el libro mayor: el alta, la edición, el borrado y el repaso agregan
// eventos, y la agenda se recalcula desde el historial en la misma transacción (un corte deja
// todo o nada). Los repasos usan el reloj inyectado: en la variante de prueba, el de la
// demostración. `fuzz`: la variación al azar de las fechas, solo en el uso real (Fase 09).
export function createCardsStore(
  db: ReteniaDatabase,
  clock: Clock,
  { fuzz = false }: { fuzz?: boolean } = {},
): CardsStore {
  const { orm } = db;

  // Programa de nuevo como nueva una tarjeta con historial: un evento «cambió lo que hay que
  // recordar» de la versión que quedó vigente.
  function resetAsNew(tx: Writer, cardId: string, versionId: string): void {
    appendObservation(tx, clock, {
      kind: 'card.meaning_changed',
      payload: { cardId, versionId },
      idempotencyKey: `meaning:${versionId}`,
      source: 'user',
    });
    recomputeCardSchedule(tx, cardId);
  }

  return {
    create(input, { source = 'user' } = {}) {
      const { question, topicId = null } = input;
      // La respuesta de un ejercicio que no es de respuesta corta sale de su actividad.
      const answer = answerFor(input.activity, input.answer);
      const now = clock.now().toISOString();
      const cardId = newId();
      const versionId = newId();
      return orm.transaction((tx) => {
        // Sin materia (un pedido de antes de la Fase 08) va a la materia activa, si hay.
        const subjectId =
          input.subjectId === undefined
            ? (tx
                .select({ id: subjects.id })
                .from(subjects)
                .where(and(eq(subjects.status, 'active'), isNull(subjects.deletedAt)))
                .get()?.id ?? null)
            : input.subjectId;
        assertPlace(tx, subjectId, topicId);
        if (input.activity) {
          assertSetProblems(tx, input.activity, subjectId);
        }
        tx.insert(cards)
          .values({ id: cardId, currentVersionId: versionId, createdAt: now, subjectId, topicId })
          .run();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId,
            question,
            answer,
            createdAt: now,
            cause: 'edit',
            ...(input.sheet === undefined
              ? {}
              : sheetColumns(mergeSheet(EMPTY_SHEET, normalizeSheet(input.sheet)))),
            ...activityJson(input.activity),
            example: input.example?.trim() ?? '',
            // La tarjeta de siempre es siempre de práctica.
            mode:
              input.activity && !alwaysPractice(input.activity.type)
                ? (input.mode ?? 'practice')
                : 'practice',
          })
          .run();
        recomputeCardSchedule(tx, cardId);
        appendOperation(tx, clock, {
          kind: 'card.create',
          entityId: cardId,
          versionAfterId: versionId,
          source,
        });
        return cardOf(tx, cardId);
      });
    },

    createFromMaterial({ question, answer, subjectId, sourceText, sourceCite }) {
      const now = clock.now().toISOString();
      const cardId = newId();
      const versionId = newId();
      return orm.transaction((tx) => {
        assertPlace(tx, subjectId, null);
        tx.insert(cards)
          .values({
            id: cardId,
            currentVersionId: versionId,
            createdAt: now,
            subjectId,
            topicId: null,
            origin: 'material',
          })
          .run();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId,
            question,
            answer,
            createdAt: now,
            cause: 'edit',
            sourceText,
            sourceCite,
          })
          .run();
        recomputeCardSchedule(tx, cardId);
        appendOperation(tx, clock, {
          kind: 'card.create',
          entityId: cardId,
          versionAfterId: versionId,
          source: 'user',
        });
        return cardOf(tx, cardId);
      });
    },

    list(input = {}) {
      return listCards(orm, input).cards;
    },

    sourceCite(cardId) {
      return findCard(orm, cardId)?.sourceCite ?? null;
    },

    updateSource({ cardId, sourceCite }) {
      orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        const previous = tx
          .select()
          .from(cardVersions)
          .where(eq(cardVersions.id, current.versionId))
          .get();
        if (!previous) {
          throw new CardNotFoundError();
        }
        const versionId = newId();
        tx.insert(cardVersions)
          .values({
            ...previous,
            id: versionId,
            sourceCite,
            createdAt: clock.now().toISOString(),
            cause: 'edit',
          })
          .run();
        tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
        appendOperation(tx, clock, {
          kind: 'card.edit',
          entityId: cardId,
          versionBeforeId: current.versionId,
          versionAfterId: versionId,
          source: 'user',
        });
      });
    },

    citing(materialId) {
      return orm
        .select({
          cardId: cards.id,
          question: cardVersions.question,
          sourceCite: cardVersions.sourceCite,
        })
        .from(cards)
        .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
        .where(
          and(
            isNull(cards.deletedAt),
            like(cardVersions.sourceCite, `%"materialId":"${materialId}"%`),
          ),
        )
        .all()
        .flatMap((row) =>
          row.sourceCite === null ? [] : [{ ...row, sourceCite: row.sourceCite }],
        );
    },

    listWithTotal(input = {}) {
      return listCards(orm, input);
    },

    get({ cardId }) {
      return detailOf(orm, activeCard(orm, cardId));
    },

    review({ cardId, grade, attemptId, helpLevel = 'A0', help, noIdea }) {
      return orm.transaction((tx) => {
        recordReview(tx, clock, fuzz, { cardId, grade, attemptId, helpLevel, help, noIdea });
        return cardOf(tx, cardId);
      });
    },

    undoReview({ cardId, attemptId }) {
      return orm.transaction((tx) => {
        activeCard(tx, cardId);
        const review = tx
          .select({ id: observations.id, kind: observations.kind, cardId: observations.cardId })
          .from(observations)
          .where(eq(observations.idempotencyKey, `review:${attemptId}`))
          .get();
        if (review?.kind !== 'review.graded' || review.cardId !== cardId) {
          throw new ReviewNotFoundError();
        }
        annulReview(tx, clock, { cardId, reviewId: review.id });
        return cardOf(tx, cardId);
      });
    },

    whyToday({ cardId }) {
      activeCard(orm, cardId);
      return whyToday(orm, cardId, studyDayOf(clock.now()));
    },

    edit({
      cardId,
      question,
      answer: given,
      sheet,
      meaningChanged,
      activity,
      example,
      mode,
      improve,
    }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        const currentSheet = sheetOf(current);
        const patch = normalizeSheet(sheet ?? {});
        if (patch.state !== undefined && !USER_SHEET_STATES.some((s) => s === patch.state)) {
          throw new SheetStateNotAllowedError();
        }
        const nextSheet: Sheet = mergeSheet(currentSheet, patch);
        const nextActivity =
          activity === undefined
            ? { activityType: current.activityType, activity: current.activity }
            : activityJson(activity);
        const nextExample = example === undefined ? current.example : example.trim();
        if (activity) {
          assertSetProblems(tx, activity, current.subjectId);
        }
        const answer =
          nextActivity.activity === null
            ? given
            : answerFor(JSON.parse(nextActivity.activity) as Activity, given);
        const textChanged = current.question !== question || current.answer !== answer;
        // Volver a la tarjeta de siempre deja el modo en práctica (no hay dónde verlo).
        const nextMode =
          nextActivity.activity === null || alwaysPractice(nextActivity.activityType)
            ? 'practice'
            : (mode ?? asMode(current.mode));
        const sheetChanged =
          sheetKey(currentSheet) !== sheetKey(nextSheet) ||
          nextActivity.activity !== current.activity ||
          nextExample !== current.example ||
          nextMode !== current.mode;
        if (!textChanged && !sheetChanged) {
          return detailOf(tx, current);
        }
        const tiedToRow = isTiedToRow(tx, current);
        if (textChanged && tiedToRow) {
          throw new LinkedCardTextError();
        }
        const hasHistory = hasHistoryOf(tx, cardId);
        if (
          needsMeaningQuestion(current, { question, answer }, hasHistory) &&
          meaningChanged === undefined
        ) {
          throw new MeaningQuestionRequiredError();
        }
        const previous = tx
          .select()
          .from(cardVersions)
          .where(eq(cardVersions.id, current.versionId))
          .get();
        if (!previous) {
          throw new CardNotFoundError();
        }
        const versionId = newId();
        tx.insert(cardVersions)
          .values({
            ...previous,
            id: versionId,
            question,
            answer,
            // El texto escrito a mano reemplaza al contenido con imágenes de antes.
            questionContent: textChanged ? null : previous.questionContent,
            answerContent: textChanged ? null : previous.answerContent,
            referenceAnswer: nextSheet.referenceAnswer,
            variants: JSON.stringify(nextSheet.variants),
            essentials: JSON.stringify(nextSheet.essentials),
            hints: JSON.stringify(nextSheet.hints),
            explanation: nextSheet.explanation,
            sourceText: nextSheet.source,
            formType: nextSheet.formType,
            sheetState: nextSheet.state,
            ...nextActivity,
            example: nextExample,
            mode: nextMode,
            createdAt: clock.now().toISOString(),
            cause: 'edit',
          })
          .run();
        tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
        appendOperation(tx, clock, {
          kind: 'card.edit',
          entityId: cardId,
          versionBeforeId: current.versionId,
          versionAfterId: versionId,
          source: 'user',
        });
        if (meaningChanged === true && textChanged && hasHistory) {
          resetAsNew(tx, cardId, versionId);
        }
        if (improve !== undefined) {
          appendObservation(tx, clock, {
            kind: 'card.improved',
            payload: { cardId, action: improve, versionId, newCardIds: [] },
            idempotencyKey: `improve:${versionId}`,
            source: 'user',
          });
        }
        return detailOf(tx, activeCard(tx, cardId));
      });
    },

    split({ splitId, cardId, parts }) {
      return orm.transaction((tx) => {
        const done = tx
          .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
          .from(observations)
          .where(eq(observations.idempotencyKey, `split:${splitId}`))
          .get();
        if (done) {
          return {
            cardIds: [...readPayload('card.improved', done.schemaVersion, done.payload).newCardIds],
          };
        }
        const current = activeCard(tx, cardId);
        const now = clock.now().toISOString();
        const cardIds: string[] = [];
        for (const part of parts) {
          const newCardId = newId();
          const versionId = newId();
          tx.insert(cards)
            .values({
              id: newCardId,
              currentVersionId: versionId,
              createdAt: now,
              subjectId: current.subjectId,
              topicId: current.topicId,
            })
            .run();
          tx.insert(cardVersions)
            .values({
              id: versionId,
              cardId: newCardId,
              question: part.question.trim(),
              answer: part.answer.trim(),
              createdAt: now,
              cause: 'edit',
            })
            .run();
          recomputeCardSchedule(tx, newCardId);
          appendOperation(tx, clock, {
            kind: 'card.create',
            entityId: newCardId,
            versionAfterId: versionId,
            source: 'user',
          });
          cardIds.push(newCardId);
        }
        // La original se retira (sale de los repasos y de «Mejorar la tarjeta») con su historial.
        const previous = tx
          .select()
          .from(cardVersions)
          .where(eq(cardVersions.id, current.versionId))
          .get();
        if (!previous) {
          throw new CardNotFoundError();
        }
        const retiredId = newId();
        tx.insert(cardVersions)
          .values({
            ...previous,
            id: retiredId,
            sheetState: 'retired',
            createdAt: now,
            cause: 'edit',
          })
          .run();
        tx.update(cards).set({ currentVersionId: retiredId }).where(eq(cards.id, cardId)).run();
        appendOperation(tx, clock, {
          kind: 'card.edit',
          entityId: cardId,
          versionBeforeId: current.versionId,
          versionAfterId: retiredId,
          source: 'user',
        });
        // Las dos nuevas quedan en el objetivo de la original (si era uno tuyo).
        const link = tx
          .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
          .from(observations)
          .where(and(eq(observations.kind, 'objective.linked'), eq(observations.cardId, cardId)))
          .orderBy(observations.seq)
          .all()
          .at(-1);
        const objectiveId =
          link === undefined
            ? null
            : readPayload('objective.linked', link.schemaVersion, link.payload).objectiveId;
        if (objectiveId !== null) {
          for (const newCardId of cardIds) {
            appendObservation(tx, clock, {
              kind: 'objective.linked',
              payload: { cardId: newCardId, objectiveId, previousObjectiveId: null },
              idempotencyKey: `link:${splitId}:${newCardId}`,
              source: 'user',
            });
          }
        }
        appendObservation(tx, clock, {
          kind: 'card.improved',
          payload: { cardId, action: 'split', versionId: retiredId, newCardIds: cardIds },
          idempotencyKey: `split:${splitId}`,
          source: 'user',
        });
        return { cardIds };
      });
    },

    markMeaningChanged({ cardId }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        if (hasHistoryOf(tx, cardId)) {
          resetAsNew(tx, cardId, current.versionId);
        }
        return cardOf(tx, cardId);
      });
    },

    setPaused({ cardId, paused }) {
      return orm.transaction((tx) => {
        const current = activeCard(tx, cardId);
        if ((current.pausedAt !== null) !== paused) {
          tx.update(cards)
            .set({ pausedAt: paused ? clock.now().toISOString() : null })
            .where(eq(cards.id, cardId))
            .run();
        }
        return cardOf(tx, cardId);
      });
    },

    createInverse({ cardId }) {
      return orm.transaction((tx) => {
        const original = activeCard(tx, cardId);
        if (original.kind === 'cloze' || original.inverseOfCardId !== null) {
          throw new InverseNotAllowedError();
        }
        const existing = tx
          .select({ id: cards.id })
          .from(cards)
          .where(and(eq(cards.inverseOfCardId, cardId), isNull(cards.deletedAt)))
          .get();
        if (existing) {
          return { card: cardOf(tx, existing.id), created: false };
        }
        const groupId = original.siblingGroupId ?? newId();
        if (original.siblingGroupId === null) {
          tx.update(cards).set({ siblingGroupId: groupId }).where(eq(cards.id, cardId)).run();
        }
        const inverseId = newId();
        const versionId = newId();
        const now = clock.now().toISOString();
        tx.insert(cards)
          .values({
            id: inverseId,
            currentVersionId: versionId,
            createdAt: now,
            subjectId: original.subjectId,
            topicId: original.topicId,
            siblingGroupId: groupId,
            inverseOfCardId: cardId,
          })
          .run();
        tx.insert(cardVersions)
          .values({
            id: versionId,
            cardId: inverseId,
            question: original.answer,
            answer: original.question,
            questionContent: original.answerContent,
            answerContent: original.questionContent,
            createdAt: now,
            cause: 'edit',
          })
          .run();
        recomputeCardSchedule(tx, inverseId);
        appendOperation(tx, clock, {
          kind: 'card.create',
          entityId: inverseId,
          versionAfterId: versionId,
          source: 'user',
        });
        return { card: cardOf(tx, inverseId), created: true };
      });
    },

    remove({ cardId }) {
      return orm.transaction((tx) => trashCard(tx, clock, cardId, { source: 'user' }));
    },

    history({ cardId }) {
      const row = findCard(orm, cardId);
      if (!row) {
        throw new CardNotFoundError();
      }
      return {
        question: row.question,
        entries: cardHistory(orm, cardId).map((event) => ({
          id: event.id,
          day: studyDayOf(event.occurredAt),
          result: event.result,
          plannedDay: event.plannedDay,
          annulled: event.annulled,
          skipped: event.skipped,
          origin: event.origin,
          counted: event.counted,
          affected: event.affected === true,
          evaluation:
            event.evaluation === null || event.evaluation === undefined
              ? null
              : {
                  ...event.evaluation,
                  versions: [...event.evaluation.versions],
                  causes: [...event.evaluation.causes],
                },
        })),
      };
    },

    activationCost({ count: cardsToAdd }) {
      return newCardsCost(cardsToAdd, estimatesOf(orm, clock).reviewSeconds);
    },

    activate({ batchId, cardIds }) {
      return orm.transaction((tx) => {
        let activated = 0;
        for (const cardId of cardIds) {
          const row = tx
            .select({ reps: cardSchedule.reps })
            .from(cards)
            .innerJoin(cardSchedule, eq(cardSchedule.cardId, cards.id))
            .where(and(eq(cards.id, cardId), isNull(cards.deletedAt)))
            .get();
          if (row === undefined || row.reps > 0) {
            continue;
          }
          const saved = appendObservation(tx, clock, {
            kind: 'card.activated',
            payload: { cardId, batchId },
            idempotencyKey: `activate:${batchId}:${cardId}`,
            source: 'user',
          });
          activated += saved.inserted ? 1 : 0;
        }
        return { activated };
      });
    },

    count() {
      // Los ejercicios (Fase 16) no son tarjetas para el contador.
      return (
        orm
          .select({ total: count() })
          .from(cards)
          .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
          .where(isNull(cardVersions.activityType))
          .get()?.total ?? 0
      );
    },

    validateActivity({ activity, subjectId }) {
      const problems: string[] = [...validateActivity(activity)];
      if (problems.length === 0 && activity.type === 'interleaved') {
        try {
          assertSetProblems(orm, activity, subjectId);
        } catch (error) {
          if (!(error instanceof InvalidActivityError)) {
            throw error;
          }
          problems.push(...error.problems);
        }
      }
      return { problems };
    },

    plantAttempts(attempts) {
      orm.transaction((tx) => {
        for (const [index, attempt] of attempts.entries()) {
          plantAttempt(tx, clock, attempt, index);
        }
      });
    },

    plantCast(entries) {
      orm.transaction((tx) => {
        for (const entry of entries) {
          plantCard(tx, clock, entry);
        }
      });
      return this.count();
    },

    plantHistory(entries) {
      orm.transaction((tx) => {
        for (const entry of entries) {
          plantHistoryOf(tx, clock, entry.cardId, entry.createdAt, entry.reviews);
        }
      });
    },

    hasManualCards() {
      return (
        orm.select({ id: cards.id }).from(cards).where(eq(cards.origin, 'manual')).get() !==
        undefined
      );
    },

    isPristine() {
      const operationCount = orm.select({ total: count() }).from(operations).get()?.total ?? 0;
      return this.count() === 0 && operationCount === 0;
    },
  };
}
