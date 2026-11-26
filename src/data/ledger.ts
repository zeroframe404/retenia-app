import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BUENOS_AIRES_ZONE, type Clock } from '../core/clock';
import { currentEvaluation, nextEvaluation } from '../core/ledger';
import type { Verdict } from '../core/memory';
import type { OrganizationOperationKind } from '../core/organization';
import type { OperationKind } from '../core/undo';
import { newId } from './ids';
import type { Writer } from './orm';
import { evaluations, ledgerState, observations, operations } from './schema';

// El libro mayor (docs/modelo-de-datos.md, sección 1). Todo lo de acá solo agrega filas: los
// disparadores de la migración 0002 rechazan cualquier intento de modificar o borrar un evento.
// Cada evento lleva un UUID v7 generado antes de guardar, el dispositivo, un número de
// secuencia (uno solo para los tres tipos de evento), la hora en UTC y la zona.

// Quién originó el evento: vos, Retenia (al adoptar datos viejos), la siembra del ejemplo o una
// importación (Fase 15: de Anki, de RemNote o de una exportación de Retenia).
export type EventSource =
  | 'user'
  | 'system'
  | 'demo'
  | 'import:anki'
  | 'import:remnote'
  | 'import:retenia';

// Sobre qué clase de cosa se hizo una operación.
export type OperationEntity = 'card' | 'subject' | 'topic' | 'note' | 'inbox';

const memorySnapshot = z.strictObject({
  state: z.number().int(),
  stability: z.number(),
  difficulty: z.number(),
  dueAt: z.iso.datetime(),
  lastReviewAt: z.iso.datetime().nullable(),
  reps: z.number().int(),
  lapses: z.number().int(),
  scheduledDays: z.number().int(),
});

const reviewGradedV1 = z.strictObject({
  cardId: z.uuid(),
  grade: z.enum(['again', 'hard', 'good']),
  helpLevel: z.literal('A0'),
  dueAtThen: z.iso.datetime(),
  // La versión de la tarjeta que se evaluó (Fase 08). Los repasos de antes no la traen.
  versionId: z.uuid().optional(),
});

// Fase 09: además de lo de la versión 1, la ayuda de la escala única y lo que decía el motor en el
// momento del intento.
const reviewGradedV2 = z.strictObject({
  cardId: z.uuid(),
  grade: z.enum(['again', 'hard', 'good']),
  helpLevel: z.enum(['A0', 'A1', 'A2', 'A3', 'A4']),
  dueAtThen: z.iso.datetime(),
  versionId: z.uuid().optional(),
  // La probabilidad de recordarla que predecía el motor (nula en una tarjeta nueva).
  predictedRecall: z.number().min(0).max(1).nullable(),
  // Los días de estudio desde el repaso anterior que contó (nulo en el primero).
  elapsedDays: z.number().int().nonnegative().nullable(),
  // Por qué apareció: vencida, reaprendizaje, elegida por mí o sondeo.
  rule: z.enum(['due', 'relearning', 'chosen', 'probe']),
  // Con qué motor y qué parámetros se calculó, la retención de la materia y si llevó la variación
  // al azar del uso real.
  engineVersion: z.number().int().positive(),
  parametersVersion: z.string().min(1),
  retention: z.number().gt(0).lte(1),
  fuzz: z.boolean(),
});

// Los milisegundos activos que suma cada paso de una sesión (con un tope por tramo quieto).
const activeMs = z.number().int().nonnegative();
const milliseconds = z.number().int().nonnegative().nullable();

// Fase 16: la escala de ayuda y cada ayuda usada (qué fue, su nivel, cuál pista y a los cuántos
// milisegundos de mostrarse la actividad).
const helpLevel = z.enum(['A0', 'A1', 'A2', 'A3', 'A4']);
const helpUse = z.strictObject({
  kind: z.enum(['hint', 'example', 'source', 'solution']),
  level: helpLevel,
  index: z.number().int().min(0).max(2).optional(),
  atMs: z.number().int().nonnegative().optional(),
});
const purpose = z.enum(['assisted', 'autonomous', 'evaluation']);

// Fase 10: además de lo de la versión 2, si el repaso fue en una sesión, la sesión, la actividad, si
// era la vuelta de una fallada (y la vuelta que creó un «No la sabía»), lo escrito en «Tu
// respuesta…» y los tiempos: cuándo se mostró, y a los cuántos milisegundos de mostrarse hubo la
// primera interacción, se pidió la respuesta y se calificó. Fuera de una sesión no van.
const reviewGradedV3 = z.strictObject({
  ...reviewGradedV2.shape,
  sessionId: z.uuid().optional(),
  activityId: z.uuid().optional(),
  retry: z.boolean().optional(),
  retryActivityId: z.uuid().nullable().optional(),
  answer: z.string().nullable().optional(),
  shownAt: z.iso.datetime().nullable().optional(),
  firstInteractionMs: milliseconds.optional(),
  answerRequestedMs: milliseconds.optional(),
  gradedMs: milliseconds.optional(),
  activeMs: activeMs.optional(),
  // Fase 11: las tres fechas del repaso. La sugerida es la que decía el motor (la de `dueAtThen`) y
  // la planificada la que quedó después de posponerlo; la real es el día en que se hizo. Solo la
  // real alimenta al motor. Se agregan a la versión 3 porque son opcionales: los repasos de antes
  // no las traen.
  suggestedDay: z.iso.date().optional(),
  plannedDay: z.iso.date().optional(),
  // Fase 16: cada ayuda usada, si se tocó «No sé por dónde empezar» y el propósito (el rótulo al
  // calificar). Opcionales: los repasos de antes no los traen.
  help: z.array(helpUse).optional(),
  noIdea: z.boolean().optional(),
  purpose: purpose.optional(),
});

// Un intento sobre un ejercicio (Fase 16, H-31): la respuesta original, el número de intento dentro
// de la apertura, la ayuda, el propósito y los tiempos. Su evaluación va aparte, en la tabla de
// evaluaciones.
const attemptAnswer = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('short'), text: z.string() }),
  z.strictObject({ type: z.literal('numeric'), raw: z.string() }),
  z.strictObject({ type: z.literal('options'), optionId: z.string(), shown: z.array(z.string()) }),
  z.strictObject({
    type: z.literal('order'),
    stepIds: z.array(z.string()),
    initial: z.array(z.string()),
  }),
  z.strictObject({ type: z.literal('open'), text: z.string() }),
  // Fase 18.
  z.strictObject({ type: z.literal('decision'), optionId: z.string(), shown: z.array(z.string()) }),
  z.strictObject({
    type: z.literal('procedure'),
    steps: z.array(z.strictObject({ stepId: z.string(), written: z.string() })),
  }),
]);
const variantValues = z.record(z.string(), z.number());
// La variante que se resolvió (Fase 18): su número, sus datos y si era una que no habías visto
// (después de haber visto otra del mismo problema).
const attemptVariant = z.strictObject({
  n: z.number().int().nonnegative(),
  values: variantValues,
  isNew: z.boolean(),
});
// En un procedimiento (Fase 18): el escalón, los pasos vacíos y lo que dio la cuenta de cada uno
// («self»: de texto, se compara con el paso modelo).
const attemptProcedure = z.strictObject({
  rung: z.number().int().nonnegative(),
  blanks: z.array(z.string()),
  checks: z.array(z.strictObject({ stepId: z.string(), state: z.enum(['ok', 'wrong', 'self']) })),
});
const attemptSubmittedV1 = z.strictObject({
  cardId: z.uuid(),
  versionId: z.uuid(),
  activityType: z.enum(['short', 'numeric', 'options', 'order', 'open', 'procedure', 'decision']),
  openingId: z.uuid(),
  attemptNo: z.number().int().positive(),
  sessionId: z.uuid().optional(),
  rule: z.enum(['due', 'relearning', 'chosen', 'probe']),
  purpose,
  answer: attemptAnswer,
  help: z.array(helpUse),
  helpLevel,
  noIdea: z.boolean(),
  optionsQuestion: z.boolean(),
  // La confianza declarada (Fase 27): todavía no se pide.
  confidence: z.enum(['guessing', 'think_so', 'sure']).nullable(),
  shownAt: z.iso.datetime(),
  firstInputMs: milliseconds,
  submittedMs: milliseconds,
  // Fase 18, opcionales: los intentos de antes no los traen.
  variant: attemptVariant.optional(),
  procedure: attemptProcedure.optional(),
  // La sesión de Estudiar desde la que se envió (nulo con «Practicar ahora»).
  studySessionId: z.uuid().optional(),
});
const appealReason = z.enum([
  'answer_correct',
  'ambiguous',
  'reference_incomplete',
  'reference_incorrect',
]);

const sessionStartedV1 = z.strictObject({
  sessionId: z.uuid(),
  subjectId: z.uuid(),
  studyDay: z.iso.date(),
  activities: z.array(z.strictObject({ activityId: z.uuid(), cardId: z.uuid() })).min(1),
  deferredSiblingIds: z.array(z.uuid()),
  activeMs,
});
// Fase 11: además, de cuántos minutos se armó y con qué versión de la política de carga.
const sessionStartedV2 = z.strictObject({
  ...sessionStartedV1.shape,
  minutes: z.number().int().positive(),
  loadPolicyVersion: z.number().int().positive(),
});

const sessionStep = z.strictObject({ sessionId: z.uuid(), activeMs });
const sessionActivityStep = z.strictObject({
  sessionId: z.uuid(),
  activityId: z.uuid(),
  activeMs,
});

// Lo esencial de cada tipo de observación, por versión del esquema. Los esquemas viejos se
// conservan para leer historial viejo; uno nuevo sube la versión y se escribe siempre con la
// última.
const PAYLOADS = {
  // Un repaso de una tarjeta: el botón que se tocó, la ayuda y la fecha en que vencía.
  'review.graded': { 1: reviewGradedV1, 2: reviewGradedV2, 3: reviewGradedV3 },
  // Un intento sobre un ejercicio (Fase 16). Mueve la agenda con su evaluación vigente.
  'attempt.submitted': { 1: attemptSubmittedV1 },
  // «Discrepo» con «La referencia está incompleta»: se anota; el resultado no cambia.
  'attempt.appealed': {
    1: z.strictObject({ cardId: z.uuid(), attemptId: z.uuid(), reason: appealReason }),
  },
  // Una enmienda de una evaluación (Fase 16, CA-140 a CA-142): qué la pidió, qué cambió en la ficha
  // (para poder deshacerla) y el próximo repaso antes y después. Las evaluaciones nuevas llevan su
  // identificador. No mueve la agenda: la mueven las evaluaciones.
  'evaluation.amended': {
    1: z.strictObject({
      cardId: z.uuid(),
      attemptId: z.uuid(),
      amendmentId: z.uuid(),
      reason: appealReason,
      before: z.enum(['correct', 'partial', 'incorrect']),
      after: z.enum(['correct', 'partial', 'incorrect', 'notCounted']),
      dueBefore: z.iso.date().nullable(),
      dueAfter: z.iso.date().nullable(),
      addedVariant: z.string().nullable(),
      addedOrder: z.array(z.string()).nullable(),
      previousSheetState: z.string().nullable(),
    }),
  },
  // «Deshacer» del aviso de evaluación corregida y «Entendido».
  'evaluation.amendment_undone': {
    1: z.strictObject({ cardId: z.uuid(), amendmentId: z.uuid() }),
  },
  'evaluation.amendment_acknowledged': {
    1: z.strictObject({ cardId: z.uuid(), amendmentId: z.uuid() }),
  },
  // «Deshacer» un repaso (Fase 09): el repaso queda en el historial y deja de contar. Desde la Fase
  // 10, si fue en una sesión, la sesión y los milisegundos activos.
  'review.annulled': {
    1: z.strictObject({ cardId: z.uuid(), reviewId: z.uuid() }),
    2: z.strictObject({
      cardId: z.uuid(),
      reviewId: z.uuid(),
      sessionId: z.uuid().optional(),
      activeMs: activeMs.optional(),
    }),
  },
  // Cambió lo que hay que recordar (Fase 08): la tarjeta vuelve a programarse como nueva.
  'card.meaning_changed': { 1: z.strictObject({ cardId: z.uuid(), versionId: z.uuid() }) },
  // La agenda que traía una tarjeta de la Fase 03, repasada antes de que existiera el libro.
  'schedule.adopted': { 1: z.strictObject({ cardId: z.uuid(), memory: memorySnapshot }) },
  // La sesión de estudio (Fase 10): la lista ordenada de actividades con que empezó y las hermanas
  // que pasaron a mañana.
  'session.started': { 1: sessionStartedV1, 2: sessionStartedV2 },
  // «Saltar»: la actividad pasa al final.
  'session.skipped': { 1: sessionActivityStep },
  // La tarjeta dejó de poder estudiarse mientras estaba en la sesión (se pausó o cambió su estado
  // desde «Editar»): sale de la sesión como hecha.
  'session.dropped': { 1: sessionActivityStep },
  // Un ejercicio contestado dentro de la sesión (Fase 18): qué intento fue (nulo si de un
  // procedimiento solo se vio el ejemplo) y cómo cuenta en el cierre.
  'session.exercise_done': {
    1: z.strictObject({
      sessionId: z.uuid(),
      activityId: z.uuid(),
      cardId: z.uuid(),
      attemptId: z.uuid().nullable(),
      outcome: z.enum(['good', 'hard', 'again', 'flagged', 'seen']),
      activeMs,
    }),
  },
  'session.paused': { 1: sessionStep },
  'session.resumed': { 1: sessionStep },
  'session.finished': { 1: sessionStep },
  // Se empezó otra sesión con esta sin terminar: sus repasos quedan.
  'session.abandoned': { 1: sessionStep },
  // «¿Cómo estuvo?»: vale el último toque.
  'session.rated': {
    1: z.strictObject({ sessionId: z.uuid(), rating: z.enum(['easy', 'fair', 'hard']) }),
  },
  // Un aplazamiento (Fase 11): la fecha que sugería el motor, la nueva fecha planificada y el motivo
  // (día corto, no cabe o a mano). No califica ni mueve la agenda: no es de los tipos que la mueven.
  'review.postponed': {
    1: z.strictObject({
      cardId: z.uuid(),
      suggestedDay: z.iso.date(),
      plannedDay: z.iso.date(),
      reason: z.enum(['shortDay', 'noFit', 'manual']),
      sessionId: z.uuid().optional(),
    }),
  },
  // «Sumar a mis repasos» (Fase 11): la tarjeta nueva pasa al principio de las nuevas.
  'card.activated': { 1: z.strictObject({ cardId: z.uuid(), batchId: z.uuid() }) },
  // Fase 17: una actividad (tarjeta o ejercicio) pasa a un objetivo, o vuelve al implícito
  // «Recordar: tema» (nulo). Los intentos de antes siguen contando para el objetivo que tenía.
  'objective.linked': {
    1: z.strictObject({
      cardId: z.uuid(),
      objectiveId: z.uuid().nullable(),
      previousObjectiveId: z.uuid().nullable(),
    }),
  },
  // «Ya lo sé» (CA-150), «No quiero esto ahora» y «Retomar».
  'objective.know_already': { 1: z.strictObject({ objectiveId: z.uuid() }) },
  'objective.postponed': { 1: z.strictObject({ objectiveId: z.uuid() }) },
  'objective.resumed': { 1: z.strictObject({ objectiveId: z.uuid() }) },
  // Un requisito entre objetivos (H-35): «objectiveId» necesita antes a «requiresId».
  'requirement.added': {
    1: z.strictObject({
      requirementId: z.uuid(),
      objectiveId: z.uuid(),
      requiresId: z.uuid(),
      kind: z.enum(['indispensable', 'recommended']),
      status: z.enum(['confirmed', 'suggested']),
    }),
  },
  // «Confirmar» uno sugerido y «Esto no es necesario para aquello».
  'requirement.confirmed': {
    1: z.strictObject({ requirementId: z.uuid(), objectiveId: z.uuid(), requiresId: z.uuid() }),
  },
  'requirement.dismissed': {
    1: z.strictObject({ requirementId: z.uuid(), objectiveId: z.uuid(), requiresId: z.uuid() }),
  },
  // «Mejorar la tarjeta» (CA-154): «Reformular» y «Agregar una pista» (con la versión nueva) o
  // «Dividir en dos» (con las dos tarjetas nuevas). Los fallos de la dificultad recurrente se
  // cuentan desde acá.
  'card.improved': {
    1: z.strictObject({
      cardId: z.uuid(),
      action: z.enum(['rephrase', 'hint', 'split']),
      versionId: z.uuid().nullable(),
      newCardIds: z.array(z.uuid()),
    }),
  },
  // «Mis errores» (CA-155): el tipo de error que elegiste para un intento.
  'mistake.type_set': {
    1: z.strictObject({
      attemptId: z.uuid(),
      cardId: z.uuid(),
      type: z.enum([
        'distraction',
        'forgotten',
        'confusion',
        'calculation',
        'missingIdea',
        'stepOrder',
        'other',
      ]),
    }),
  },
  // Fase 18. La variante que se mostró al abrir un problema con variantes (en un día cuenta la
  // primera que viste).
  'variant.seen': {
    1: z.strictObject({
      cardId: z.uuid(),
      versionId: z.uuid(),
      openingId: z.uuid(),
      n: z.number().int().nonnegative(),
      values: variantValues,
    }),
  },
  // Lo que se mostró al abrir un procedimiento: la versión, el escalón y los pasos vacíos. Es lo
  // que después se corrige, aunque en el medio cambie el día de estudio.
  'procedure.opened': {
    1: z.strictObject({
      cardId: z.uuid(),
      versionId: z.uuid(),
      openingId: z.uuid(),
      rung: z.number().int().nonnegative(),
      blanks: z.array(z.string()),
    }),
  },
  // «Crear tarjeta de contraste»: el mismo pedido crea una sola. `cardId` es la tarjeta nueva.
  'contrast.created': {
    1: z.strictObject({ cardId: z.uuid(), requestId: z.uuid(), attemptId: z.uuid() }),
  },
  // El ejemplo completo de un procedimiento, con lo que contestaste en «¿Por qué este paso?» (se
  // guarda; no se califica).
  'procedure.studied': {
    1: z.strictObject({
      cardId: z.uuid(),
      versionId: z.uuid(),
      openingId: z.uuid(),
      why: z.array(z.strictObject({ stepId: z.string(), answer: z.string() })),
      studySessionId: z.uuid().optional(),
    }),
  },
  // «Reintentar» un paso antes de ver la corrección, y haberla visto.
  'procedure.step_retried': {
    1: z.strictObject({
      cardId: z.uuid(),
      attemptId: z.uuid(),
      stepId: z.string(),
      written: z.string(),
      ok: z.boolean(),
    }),
  },
  'procedure.revealed': { 1: z.strictObject({ cardId: z.uuid(), attemptId: z.uuid() }) },
  // El conjunto intercalado (CA-162): los problemas en el orden en que van a salir, con su tipo.
  // `cardId` es el del conjunto.
  'set.started': {
    1: z.strictObject({
      cardId: z.uuid(),
      runId: z.uuid(),
      title: z.string(),
      items: z.array(
        z.strictObject({ cardId: z.uuid(), typeId: z.string(), typeName: z.string() }),
      ),
    }),
  },
  // El micro-ejercicio (CA-166) sobre un punto: un paso de un procedimiento o la cuenta de un
  // problema con variantes (`stepId` nulo). `cardId` es el del problema.
  'micro.started': {
    1: z.strictObject({
      cardId: z.uuid(),
      versionId: z.uuid(),
      microId: z.uuid(),
      stepId: z.string().nullable(),
      items: z.array(z.strictObject({ n: z.number().int().nonnegative(), values: variantValues })),
    }),
  },
  'micro.item': {
    1: z.strictObject({
      cardId: z.uuid(),
      microId: z.uuid(),
      index: z.number().int().nonnegative(),
      written: z.string(),
      // Nulo mientras no compares un paso de texto con el modelo.
      ok: z.boolean().nullable(),
    }),
  },
  'micro.finished': {
    1: z.strictObject({
      cardId: z.uuid(),
      microId: z.uuid(),
      stepId: z.string().nullable(),
      items: z.array(z.strictObject({ ok: z.boolean(), hinted: z.boolean() })),
    }),
  },
  // «La tarjeta está mal» (CA-077): la ficha pasa a «En revisión» (esa versión) y el intento no
  // mueve la agenda (no es de los tipos que la mueven).
  'card.flagged': {
    1: z.strictObject({
      cardId: z.uuid(),
      sessionId: z.uuid(),
      activityId: z.uuid(),
      attemptId: z.uuid(),
      versionId: z.uuid(),
      activeMs,
    }),
  },
};
const CURRENT_VERSION = {
  'review.graded': 3,
  'attempt.submitted': 1,
  'attempt.appealed': 1,
  'evaluation.amended': 1,
  'evaluation.amendment_undone': 1,
  'evaluation.amendment_acknowledged': 1,
  'review.annulled': 2,
  'card.meaning_changed': 1,
  'schedule.adopted': 1,
  'session.started': 2,
  'session.skipped': 1,
  'session.dropped': 1,
  'session.exercise_done': 1,
  'session.paused': 1,
  'session.resumed': 1,
  'session.finished': 1,
  'session.abandoned': 1,
  'session.rated': 1,
  'card.flagged': 1,
  'review.postponed': 1,
  'card.activated': 1,
  'objective.linked': 1,
  'objective.know_already': 1,
  'objective.postponed': 1,
  'objective.resumed': 1,
  'requirement.added': 1,
  'requirement.confirmed': 1,
  'requirement.dismissed': 1,
  'card.improved': 1,
  'mistake.type_set': 1,
  'variant.seen': 1,
  'procedure.opened': 1,
  'contrast.created': 1,
  'procedure.studied': 1,
  'procedure.step_retried': 1,
  'procedure.revealed': 1,
  'set.started': 1,
  'micro.started': 1,
  'micro.item': 1,
  'micro.finished': 1,
} as const;

type Payloads = typeof PAYLOADS;
export type ObservationKind = keyof Payloads;
type CurrentVersion<K extends ObservationKind> = (typeof CURRENT_VERSION)[K];
// Lo que se escribe hoy: siempre la última versión del esquema.
export type ObservationPayload<K extends ObservationKind> = z.output<
  Payloads[K][CurrentVersion<K> & keyof Payloads[K]] & z.ZodType
>;
// Lo que se puede leer: cualquiera de las versiones que existieron.
export type StoredPayload<K extends ObservationKind> = z.output<
  Payloads[K][keyof Payloads[K]] & z.ZodType
>;

function schemaOf(kind: ObservationKind, version: number): z.ZodType | undefined {
  const versions: Record<number, z.ZodType> = PAYLOADS[kind];
  return versions[version];
}

export function readPayload<K extends ObservationKind>(
  kind: K,
  schemaVersion: number,
  payload: string,
): StoredPayload<K> {
  const schema = schemaOf(kind, schemaVersion);
  if (!schema) {
    throw new Error(`No sé leer la versión ${schemaVersion} de «${kind}»`);
  }
  return schema.parse(JSON.parse(payload)) as StoredPayload<K>;
}

// La primera vez que se abre una base, se crea su dispositivo.
export function ensureLedgerState(db: Writer, now: Date): void {
  db.insert(ledgerState)
    .values({ id: 1, deviceId: newId(), lastSeq: 0, createdAt: now.toISOString() })
    .onConflictDoNothing()
    .run();
}

export function readLedgerState(db: Writer): { deviceId: string; lastSeq: number } {
  const row = db
    .select({ deviceId: ledgerState.deviceId, lastSeq: ledgerState.lastSeq })
    .from(ledgerState)
    .where(eq(ledgerState.id, 1))
    .get();
  if (!row) {
    throw new Error('El libro mayor no tiene dispositivo');
  }
  return row;
}

// Al restaurar una copia vieja, el dispositivo sigue siendo este y la secuencia sigue desde el
// número más alto que ya usó: así un par (dispositivo, número) nunca se repite.
export function continueSequence(db: Writer, live: { deviceId: string; lastSeq: number }): void {
  db.update(ledgerState)
    .set({
      deviceId: live.deviceId,
      lastSeq: sql`max(${ledgerState.lastSeq}, ${live.lastSeq})`,
    })
    .where(eq(ledgerState.id, 1))
    .run();
}

function nextSeq(tx: Writer): { deviceId: string; seq: number } {
  const row = tx
    .update(ledgerState)
    .set({ lastSeq: sql`${ledgerState.lastSeq} + 1` })
    .where(eq(ledgerState.id, 1))
    .returning({ deviceId: ledgerState.deviceId, seq: ledgerState.lastSeq })
    .get();
  if (!row) {
    throw new Error('El libro mayor no tiene dispositivo');
  }
  return row;
}

// Agrega una observación. Si ya hay una con la misma clave de idempotencia (el mismo repaso que
// llega dos veces), no agrega nada ni gasta número de secuencia y devuelve la que estaba.
export function appendObservation<K extends ObservationKind>(
  tx: Writer,
  clock: Clock,
  input: {
    kind: K;
    payload: ObservationPayload<K>;
    idempotencyKey: string;
    source: EventSource;
    occurredAt?: Date;
  },
): { id: string; inserted: boolean } {
  const existing = tx
    .select({ id: observations.id })
    .from(observations)
    .where(eq(observations.idempotencyKey, input.idempotencyKey))
    .get();
  if (existing) {
    return { id: existing.id, inserted: false };
  }
  const schemaVersion = CURRENT_VERSION[input.kind];
  const schema = schemaOf(input.kind, schemaVersion);
  if (!schema) {
    throw new Error(`No hay esquema para «${input.kind}»`);
  }
  const payload = JSON.stringify(schema.parse(input.payload));
  const now = clock.now();
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  const result = tx
    .insert(observations)
    .values({
      id,
      kind: input.kind,
      occurredAt: (input.occurredAt ?? now).toISOString(),
      recordedAt: now.toISOString(),
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
      payload,
      schemaVersion,
      idempotencyKey: input.idempotencyKey,
      source: input.source,
    })
    .onConflictDoNothing({ target: observations.idempotencyKey })
    .run();
  if (result.changes !== 1) {
    // No puede pasar dentro de la misma transacción; si pasara, se deshace todo.
    throw new Error('La observación ya estaba guardada');
  }
  return { id, inserted: true };
}

// Agrega una evaluación de un intento: la versión 1 si no tenía, o la siguiente apuntando a la
// vigente (enmendar nunca cambia la anterior).
export interface EvaluationFacts {
  // Lo que propuso Retenia (el veredicto nunca queda más alto).
  readonly proposedVerdict?: Verdict | null;
  readonly rubricVersion?: string | null;
  readonly contentVersionId?: string | null;
  // El estado de cada componente, como objeto (se guarda como JSON).
  readonly components?: unknown;
  readonly certainty?: 'certain' | 'uncertain';
  readonly engineSignal?: 'again' | 'hard' | 'good' | null;
  readonly cause?: 'graded' | 'lowered' | 'appeal' | 'undo' | 'reference_incorrect' | 'flagged';
  readonly appealReason?: string | null;
  readonly affected?: boolean;
  readonly amendmentId?: string | null;
  readonly undoesAmendmentId?: string | null;
}

export function appendEvaluation(
  tx: Writer,
  clock: Clock,
  input: {
    attemptId: string;
    verdict: Verdict;
    // «rule» (la regla de Retenia) o quien la hizo: vos, una importación.
    source: EventSource | 'rule';
  } & EvaluationFacts,
): { id: string; version: number } {
  const versions = tx
    .select({ id: evaluations.id, version: evaluations.version })
    .from(evaluations)
    .where(eq(evaluations.attemptId, input.attemptId))
    .all();
  const { version, supersedesId } = nextEvaluation(currentEvaluation(versions));
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  tx.insert(evaluations)
    .values({
      id,
      attemptId: input.attemptId,
      version,
      supersedesId,
      verdict: input.verdict,
      source: input.source,
      proposedVerdict: input.proposedVerdict ?? null,
      rubricVersion: input.rubricVersion ?? null,
      contentVersionId: input.contentVersionId ?? null,
      components: input.components === undefined ? null : JSON.stringify(input.components),
      certainty: input.certainty ?? 'certain',
      engineSignal: input.engineSignal ?? null,
      cause: input.cause ?? 'graded',
      appealReason: input.appealReason ?? null,
      affected: input.affected === true ? 1 : 0,
      amendmentId: input.amendmentId ?? null,
      undoesAmendmentId: input.undoesAmendmentId ?? null,
      createdAt: clock.now().toISOString(),
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
    })
    .run();
  return { id, version };
}

// Agrega una operación al registro de «Actividad reciente» y «Deshacer».
export function appendOperation(
  tx: Writer,
  clock: Clock,
  input: {
    kind: OperationKind | OrganizationOperationKind;
    // Qué clase de cosa cambió (por defecto, una tarjeta).
    entityType?: OperationEntity;
    entityId: string;
    versionBeforeId?: string | null;
    versionAfterId?: string | null;
    trashEntryId?: string | null;
    undoesId?: string | null;
    // Lo que hace falta para deshacer, como objeto (se guarda como JSON).
    detail?: Record<string, unknown>;
    source: EventSource;
  },
): { id: string } {
  const now = clock.now().toISOString();
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  tx.insert(operations)
    .values({
      id,
      kind: input.kind,
      entityType: input.entityType ?? 'card',
      entityId: input.entityId,
      versionBeforeId: input.versionBeforeId ?? null,
      versionAfterId: input.versionAfterId ?? null,
      trashEntryId: input.trashEntryId ?? null,
      undoesId: input.undoesId ?? null,
      detail: input.detail === undefined ? null : JSON.stringify(input.detail),
      source: input.source,
      occurredAt: now,
      recordedAt: now,
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
    })
    .run();
  return { id };
}
