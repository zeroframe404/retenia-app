import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  addToEstimate,
  blocks,
  conceptKeyOf,
  conceptNameOf,
  type Estimate,
  estimateBacking,
  estimateMean,
  type Frontier,
  foldRequirements,
  frontier,
  INITIAL_ESTIMATE,
  isMet,
  type MasteryEvent,
  type MasteryResult,
  nextStepOf,
  type ObjectiveKind,
  outcomeOf,
  parseObjectiveText,
  projectMastery,
  type Requirement,
  type RequirementEvent,
  wouldCreateCycle,
} from '../core/mastery';
import { studyDayOf } from '../core/study-day';
import type {
  ObjectivePanel,
  ObjectiveSummary,
  ObjectivesList,
  RequirementView,
} from '../preload/contract/objectives';
import type { RequirementLine } from '../preload/contract/study';
import type { ReteniaDatabase } from './database';
import { type EvidenceAttempt, type SubjectCard, subjectCards, subjectEvidence } from './evidence';
import { appendObservation, readPayload } from './ledger';
import type { Writer } from './orm';
import { cards, objectives, observations, subjects, topics } from './schema';

// Los objetivos (Fase 17, H-34 y H-35). Un objetivo tuyo es una fila que no se modifica; sus
// actividades, «Ya lo sé», «No quiero esto ahora» y sus requisitos son eventos del libro mayor; su
// estado y la estimación de su concepto se calculan al leer, desde la evidencia (los intentos), con
// las reglas de core/mastery. Una actividad sin objetivo tuyo es del implícito «Recordar: tema»
// («topic:<tema>», o «subject:<materia>» para las que no tienen tema), que no es una fila.
//
// Cada intento cuenta para el objetivo que tenía su actividad en ese momento: mover una actividad
// de objetivo no borra ni traslada evidencia.

const OBJECTIVE_KINDS = [
  'objective.know_already',
  'objective.postponed',
  'objective.resumed',
  'requirement.added',
  'requirement.confirmed',
  'requirement.dismissed',
];

const OUT_OF_PRACTICE = ['in_review', 'retired'];

class ObjectiveNotFoundError extends Error {
  constructor() {
    super('No encontré ese objetivo');
    this.name = 'ObjectiveNotFoundError';
  }
}

class ObjectivePlaceError extends Error {
  constructor() {
    super('El tema o las actividades no son de la materia del objetivo');
    this.name = 'ObjectivePlaceError';
  }
}

class KnowAlreadyNotAllowedError extends Error {
  constructor() {
    super('«Ya lo sé» vale solo para un objetivo «Sin iniciar»');
    this.name = 'KnowAlreadyNotAllowedError';
  }
}

class RequirementNotAllowedError extends Error {
  constructor() {
    super('Ese requisito no se puede agregar: armaría un círculo o es el mismo objetivo');
    this.name = 'RequirementNotAllowedError';
  }
}

class RequirementNotFoundError extends Error {
  constructor() {
    super('No encontré ese requisito');
    this.name = 'RequirementNotFoundError';
  }
}

interface ObjectiveModel {
  readonly id: string;
  readonly implicit: boolean;
  readonly topicId: string | null;
  readonly topicName: string | null;
  // En uno implícito, el nombre del tema (o nulo, sin tema).
  readonly title: string;
  readonly action: string;
  readonly content: string;
  readonly conditions: string | null;
  readonly kind: ObjectiveKind;
  readonly conceptKey: string;
  readonly conceptName: string;
  readonly postponed: boolean;
  readonly mastery: MasteryResult;
  // Sus actividades de ahora (sin las de la Papelera).
  readonly activities: readonly SubjectCard[];
  // Intentos válidos de sus actividades de cuando eran de otro objetivo.
  readonly previousAttempts: number;
}

export interface ObjectivesSnapshot {
  readonly subject: { readonly id: string; readonly name: string };
  readonly topics: readonly { readonly id: string; readonly name: string }[];
  readonly objectives: readonly ObjectiveModel[];
  readonly byId: ReadonlyMap<string, ObjectiveModel>;
  // El objetivo de ahora de cada actividad.
  readonly cardObjective: ReadonlyMap<string, string>;
  readonly cards: ReadonlyMap<string, SubjectCard>;
  readonly evidence: ReadonlyMap<string, readonly EvidenceAttempt[]>;
  readonly requirements: readonly Requirement[];
  readonly frontier: Frontier;
  estimateOf(objective: ObjectiveModel): Estimate;
}

const isPracticable = (card: SubjectCard) =>
  !card.deleted && card.pausedAt === null && !OUT_OF_PRACTICE.includes(card.sheetState);

function attemptEvent(attempt: EvidenceAttempt): MasteryEvent {
  return {
    kind: 'attempt',
    id: attempt.id,
    seq: attempt.seq,
    studyDay: attempt.studyDay,
    activityId: attempt.cardId,
    verdict: attempt.verdict ?? 'incorrect',
    helpLevel: attempt.helpLevel,
    optionsQuestion: attempt.optionsQuestion,
    valid: attempt.valid && attempt.verdict !== null,
    newVariant: attempt.newVariant,
  };
}

function requirementEventOf(row: {
  id: string;
  kind: string;
  seq: number;
  payload: string;
  schemaVersion: number;
}): RequirementEvent | null {
  if (row.kind === 'requirement.added') {
    const payload = readPayload('requirement.added', row.schemaVersion, row.payload);
    return {
      kind: 'added',
      id: row.id,
      seq: row.seq,
      requirementId: payload.requirementId,
      objectiveId: payload.objectiveId,
      requiresId: payload.requiresId,
      requirementKind: payload.kind,
      status: payload.status,
    };
  }
  if (row.kind === 'requirement.confirmed' || row.kind === 'requirement.dismissed') {
    const payload = readPayload(row.kind, row.schemaVersion, row.payload);
    return {
      kind: row.kind === 'requirement.confirmed' ? 'confirmed' : 'dismissed',
      id: row.id,
      seq: row.seq,
      requirementId: payload.requirementId,
    };
  }
  return null;
}

// Agrega al final de la lista de una clave (sin copiar la lista: con muchos intentos, copiarla en
// cada uno crecía al cuadrado).
function pushInto<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

// Todo lo de los objetivos de una materia, calculado desde el historial. Nulo si la materia no
// existe.
export function objectivesSnapshot(db: Writer, subjectId: string): ObjectivesSnapshot | null {
  const subject = db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
    .get();
  if (!subject) {
    return null;
  }
  const topicRows = db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.subjectId, subjectId), isNull(topics.deletedAt)))
    .orderBy(topics.position, topics.id)
    .all();
  const topicName = new Map(topicRows.map((topic) => [topic.id, topic.name]));
  const rows = db
    .select()
    .from(objectives)
    .where(and(eq(objectives.subjectId, subjectId), isNull(objectives.deletedAt)))
    .orderBy(objectives.createdAt, objectives.id)
    .all();
  const explicitIds = new Set(rows.map((row) => row.id));
  const cardList = subjectCards(db, subjectId);
  const cardMap = new Map(cardList.map((card) => [card.id, card]));

  // Los enlaces de cada actividad, en el orden de registro. También los de las tarjetas que ya se
  // vaciaron de la Papelera (ya no tienen fila) y estuvieron en un objetivo tuyo: su evidencia sigue.
  const linkRows = (where: SQL | undefined) =>
    where === undefined
      ? []
      : db
          .select({
            seq: observations.seq,
            payload: observations.payload,
            schemaVersion: observations.schemaVersion,
          })
          .from(observations)
          .leftJoin(cards, eq(cards.id, observations.cardId))
          .where(and(eq(observations.kind, 'objective.linked'), where))
          .orderBy(observations.seq)
          .all();
  const links = new Map<string, { seq: number; objectiveId: string | null }[]>();
  const addLink = (row: { seq: number; payload: string; schemaVersion: number }) => {
    const payload = readPayload('objective.linked', row.schemaVersion, row.payload);
    pushInto(links, payload.cardId, { seq: row.seq, objectiveId: payload.objectiveId });
  };
  for (const row of linkRows(eq(cards.subjectId, subjectId))) {
    addLink(row);
  }
  const purged = [
    ...new Set(
      linkRows(
        explicitIds.size === 0 ? undefined : inArray(observations.objectiveId, [...explicitIds]),
      )
        .map((row) => readPayload('objective.linked', row.schemaVersion, row.payload).cardId)
        .filter((cardId) => !cardMap.has(cardId)),
    ),
  ];
  for (const row of linkRows(
    purged.length === 0 ? undefined : inArray(observations.cardId, purged),
  )) {
    addLink(row);
  }
  const implicitOf = (card: SubjectCard) =>
    card.topicId !== null && topicName.has(card.topicId)
      ? `topic:${card.topicId}`
      : `subject:${subjectId}`;
  // El objetivo tuyo que tenía la actividad antes de `seq` (nulo: el implícito).
  const explicitAt = (cardId: string, seq: number) => {
    let current: string | null = null;
    for (const link of links.get(cardId) ?? []) {
      if (link.seq >= seq) {
        break;
      }
      current = link.objectiveId;
    }
    return current !== null && explicitIds.has(current) ? current : null;
  };
  const objectiveAt = (card: SubjectCard, seq: number) =>
    explicitAt(card.id, seq) ?? implicitOf(card);
  const cardObjective = new Map(
    cardList.map((card) => [card.id, objectiveAt(card, Number.POSITIVE_INFINITY)]),
  );

  // La evidencia, repartida según el objetivo que tenía cada actividad en el momento. De una tarjeta
  // vaciada de la Papelera solo se sabe el objetivo tuyo en que estuvo (su tema ya no está).
  const evidence = subjectEvidence(db, { subjectId });
  for (const [cardId, attempts] of subjectEvidence(db, { cardIds: purged })) {
    evidence.set(cardId, attempts);
  }
  const eventsOf = new Map<string, MasteryEvent[]>();
  const attemptsOf = new Map<string, EvidenceAttempt[]>();
  const attribution = new Map<string, string>();
  for (const [cardId, attempts] of evidence) {
    const card = cardMap.get(cardId);
    for (const attempt of attempts) {
      const objectiveId = card ? objectiveAt(card, attempt.seq) : explicitAt(cardId, attempt.seq);
      if (objectiveId === null) {
        continue;
      }
      attribution.set(attempt.id, objectiveId);
      pushInto(eventsOf, objectiveId, attemptEvent(attempt));
      pushInto(attemptsOf, objectiveId, attempt);
    }
  }

  // «Ya lo sé», posponer y los requisitos.
  const objectiveRows =
    explicitIds.size === 0
      ? []
      : db
          .select({
            id: observations.id,
            kind: observations.kind,
            seq: observations.seq,
            occurredAt: observations.occurredAt,
            payload: observations.payload,
            schemaVersion: observations.schemaVersion,
            objectiveId: observations.objectiveId,
          })
          .from(observations)
          .where(
            and(
              inArray(observations.kind, OBJECTIVE_KINDS),
              inArray(observations.objectiveId, [...explicitIds]),
            ),
          )
          .orderBy(observations.seq)
          .all();
  const postponed = new Set<string>();
  const requirementEvents: RequirementEvent[] = [];
  for (const row of objectiveRows) {
    const objectiveId = row.objectiveId ?? '';
    if (row.kind === 'objective.know_already') {
      pushInto(eventsOf, objectiveId, {
        kind: 'knowAlready',
        id: row.id,
        seq: row.seq,
        studyDay: studyDayOf(new Date(row.occurredAt)),
      });
    } else if (row.kind === 'objective.postponed') {
      postponed.add(objectiveId);
    } else if (row.kind === 'objective.resumed') {
      postponed.delete(objectiveId);
    } else {
      const event = requirementEventOf(row);
      if (event) {
        requirementEvents.push(event);
      }
    }
  }
  // Solo los requisitos entre objetivos de esta materia.
  const requirements = foldRequirements(requirementEvents).filter((requirement) =>
    explicitIds.has(requirement.requiresId),
  );

  const activitiesOf = (objectiveId: string) =>
    cardList.filter((card) => !card.deleted && cardObjective.get(card.id) === objectiveId);
  const previousOf = (objectiveId: string, activities: readonly SubjectCard[]) =>
    activities.reduce(
      (total, card) =>
        total +
        (evidence.get(card.id) ?? []).filter(
          (attempt) => attempt.valid && attribution.get(attempt.id) !== objectiveId,
        ).length,
      0,
    );

  const models: ObjectiveModel[] = [];
  const implicitIds = [...topicRows.map((topic) => `topic:${topic.id}`), `subject:${subjectId}`];
  for (const id of implicitIds) {
    const activities = activitiesOf(id);
    if (activities.length === 0 && !eventsOf.has(id)) {
      continue;
    }
    const topicId = id.startsWith('topic:') ? id.slice('topic:'.length) : null;
    const name = topicId === null ? null : (topicName.get(topicId) ?? null);
    models.push({
      id,
      implicit: true,
      topicId,
      topicName: name,
      title: name ?? '',
      action: '',
      content: name ?? '',
      conditions: null,
      kind: 'remember',
      conceptKey: conceptKeyOf(name ?? ''),
      conceptName: name ?? '',
      postponed: false,
      mastery: projectMastery(eventsOf.get(id) ?? []),
      activities,
      previousAttempts: previousOf(id, activities),
    });
  }
  for (const row of rows) {
    const activities = activitiesOf(row.id);
    const topicId = row.topicId !== null && topicName.has(row.topicId) ? row.topicId : null;
    models.push({
      id: row.id,
      implicit: false,
      topicId,
      topicName: topicId === null ? null : (topicName.get(topicId) ?? null),
      title: row.title,
      action: row.action,
      content: row.content,
      conditions: row.conditions,
      kind: row.kind as ObjectiveKind,
      conceptKey: row.conceptKey,
      conceptName: conceptNameOf(row.content === '' ? row.title : row.content),
      postponed: postponed.has(row.id),
      // En «Aplicar», «Consolidado» pide además una variante nueva (CA-165).
      mastery: projectMastery(eventsOf.get(row.id) ?? [], { needsVariant: row.kind === 'apply' }),
      activities,
      previousAttempts: previousOf(row.id, activities),
    });
  }
  const byId = new Map(models.map((model) => [model.id, model]));

  // La estimación de cada concepto (por nivel): los intentos de los objetivos con ese concepto y
  // ese tipo, el primero de cada actividad por día.
  const estimates = new Map<string, Estimate>();
  const keyOf = (model: ObjectiveModel) => `${model.conceptKey} ${model.kind}`;
  const estimateOf = (model: ObjectiveModel): Estimate => {
    const key = keyOf(model);
    const known = estimates.get(key);
    if (known) {
      return known;
    }
    const attempts = models
      .filter((other) => keyOf(other) === key)
      .flatMap((other) => attemptsOf.get(other.id) ?? [])
      .filter((attempt) => attempt.valid && attempt.verdict !== null)
      .sort((a, b) => a.seq - b.seq);
    const seen = new Set<string>();
    let estimate = INITIAL_ESTIMATE;
    for (const attempt of attempts) {
      const slot = `${attempt.cardId} ${attempt.studyDay}`;
      if (seen.has(slot)) {
        continue;
      }
      seen.add(slot);
      estimate = addToEstimate(estimate, {
        outcome: outcomeOf({
          verdict: attempt.verdict ?? 'incorrect',
          helpLevel: attempt.helpLevel,
        }),
        helpLevel: attempt.helpLevel,
        optionsQuestion: attempt.optionsQuestion,
        valid: true,
      });
    }
    estimates.set(key, estimate);
    return estimate;
  };

  return {
    subject,
    topics: topicRows,
    objectives: models,
    byId,
    cardObjective,
    cards: cardMap,
    evidence,
    requirements,
    frontier: frontier({
      objectives: models.map((model) => ({
        id: model.id,
        state: model.mastery.state,
        postponed: model.postponed,
      })),
      requirements,
    }),
    estimateOf,
  };
}

function summaryOf(model: ObjectiveModel): ObjectiveSummary {
  return {
    id: model.id,
    implicit: model.implicit,
    topicId: model.topicId,
    topicName: model.topicName,
    title: model.title,
    kind: model.kind,
    state: model.mastery.state,
    toVerify: model.mastery.toVerify,
    postponed: model.postponed,
    activityCount: model.activities.length,
  };
}

function requirementView(snapshot: ObjectivesSnapshot, requirement: Requirement): RequirementView {
  const dependent = snapshot.byId.get(requirement.objectiveId);
  const required = snapshot.byId.get(requirement.requiresId);
  const requiredState = required?.mastery.state ?? 'not-started';
  const met = isMet(requiredState);
  return {
    requirementId: requirement.id,
    objectiveId: requirement.objectiveId,
    objectiveTitle: dependent?.title ?? '',
    requiresId: requirement.requiresId,
    requiresTitle: required?.title ?? '',
    kind: requirement.kind,
    status: requirement.status,
    requiredState,
    met,
    blocking: blocks(requirement) && !met,
  };
}

// La subject para listar: la pedida, o la activa, o la primera.
export function subjectFor(db: Writer, subjectId: string | undefined): string | null {
  if (subjectId !== undefined) {
    return subjectId;
  }
  const live = db
    .select({ id: subjects.id, status: subjects.status, isExample: subjects.isExample })
    .from(subjects)
    .where(isNull(subjects.deletedAt))
    .orderBy(subjects.createdAt, subjects.id)
    .all();
  return (
    live.find((subject) => subject.status === 'active')?.id ??
    live.find((subject) => !subject.isExample)?.id ??
    live[0]?.id ??
    null
  );
}

// El requisito sin cumplir que tiene que nombrar Estudiar en la materia (H-35): primero uno que
// frena («Antes conviene»), si no uno que avisa («Quizá te ayude repasar»); entre varios, el del
// concepto con menor estimación y, a igualdad, el primero que se agregó. Además, las tarjetas nuevas
// que no se proponen (de objetivos frenados o pospuestos) y las que son de un requisito.
export interface StudyObjectives {
  readonly heldNewCards: ReadonlySet<string>;
  readonly requisiteCards: ReadonlySet<string>;
  readonly line: RequirementLine | null;
  // La comprobación de un «Ya lo sé» que ya se puede hacer (CA-150): la primera, por orden de creación.
  readonly check: {
    readonly objectiveId: string;
    readonly objectiveTitle: string;
    readonly practiceCardId: string | null;
  } | null;
}

// Si la materia no tiene ningún requisito, objetivo pospuesto ni «Ya lo sé», nada cambia (y no hace
// falta calcular nada).
function hasStudyEffects(db: Writer, subjectId: string): boolean {
  return (
    db
      .select({ id: observations.id })
      .from(observations)
      .innerJoin(objectives, eq(objectives.id, observations.objectiveId))
      .where(
        and(
          eq(objectives.subjectId, subjectId),
          inArray(observations.kind, [
            'requirement.added',
            'objective.postponed',
            'objective.know_already',
          ]),
        ),
      )
      .get() !== undefined
  );
}

export function studyObjectives(
  db: Writer,
  subjectId: string,
  today: string,
): StudyObjectives | null {
  if (!hasStudyEffects(db, subjectId)) {
    return null;
  }
  const snapshot = objectivesSnapshot(db, subjectId);
  if (!snapshot) {
    return null;
  }
  const held = new Set<string>();
  for (const model of snapshot.objectives) {
    if (model.postponed || snapshot.frontier.blocked.has(model.id)) {
      for (const card of model.activities) {
        held.add(card.id);
      }
    }
  }
  const requiredIds = new Set(
    snapshot.requirements
      .filter((requirement) => !requirement.dismissed)
      .map((requirement) => requirement.requiresId),
  );
  const requisite = new Set<string>();
  for (const id of requiredIds) {
    for (const card of snapshot.byId.get(id)?.activities ?? []) {
      requisite.add(card.id);
    }
  }
  const pick = (map: ReadonlyMap<string, readonly Requirement[]>) =>
    [...map.entries()]
      .filter(([objectiveId]) => snapshot.byId.get(objectiveId)?.postponed === false)
      .flatMap(([, list]) => list)
      .map((requirement) => ({
        requirement,
        mean: estimateMean(
          snapshot.estimateOf(snapshot.byId.get(requirement.requiresId) as ObjectiveModel),
        ),
      }))
      .sort((a, b) => a.mean - b.mean || a.requirement.seq - b.requirement.seq)[0]?.requirement;
  // Con requisitos en cadena (A necesita B y B necesita C), lo primero que hay que hacer es C: si el
  // requisito elegido también está frenado, se sigue por el suyo.
  const deepest = (start: Requirement) => {
    let current = start;
    const seen = new Set<string>([current.objectiveId]);
    for (;;) {
      const next = pick(
        new Map(
          [...snapshot.frontier.blocked.entries()].filter(
            ([objectiveId]) => objectiveId === current.requiresId,
          ),
        ),
      );
      if (next === undefined || seen.has(next.objectiveId)) {
        return current;
      }
      seen.add(next.objectiveId);
      current = next;
    }
  };
  const firstBlocking = pick(snapshot.frontier.blocked);
  const before = firstBlocking === undefined ? undefined : deepest(firstBlocking);
  const chosen = before ?? pick(snapshot.frontier.warnings);
  let line: RequirementLine | null = null;
  if (chosen) {
    const required = snapshot.byId.get(chosen.requiresId) as ObjectiveModel;
    line = {
      kind: before ? 'before' : 'maybe',
      requirementId: chosen.id,
      objectiveId: chosen.objectiveId,
      objectiveTitle: snapshot.byId.get(chosen.objectiveId)?.title ?? '',
      requiresId: chosen.requiresId,
      requiresTitle: required.title,
      requiresState: required.mastery.state,
      practiceCardId: required.activities.find(isPracticable)?.id ?? null,
    };
  }
  const toCheck = snapshot.objectives.find(
    (model) =>
      !model.postponed &&
      model.mastery.pendingCheckFrom !== null &&
      model.mastery.pendingCheckFrom <= today,
  );
  return {
    heldNewCards: held,
    requisiteCards: requisite,
    line,
    check: toCheck
      ? {
          objectiveId: toCheck.id,
          objectiveTitle: toCheck.title,
          practiceCardId: toCheck.activities.find(isPracticable)?.id ?? null,
        }
      : null,
  };
}

export interface ObjectivesStore {
  list(input: { subjectId?: string | undefined }): ObjectivesList;
  create(
    input: {
      objectiveId: string;
      subjectId: string;
      topicId: string | null;
      text: string;
      conditions: string | null;
      kind: ObjectiveKind;
      cardIds: readonly string[];
    },
    options?: { source?: 'user' | 'demo' },
  ): { objectiveId: string; observable: boolean };
  activities(input: { subjectId: string; topicId?: string | null | undefined }): {
    activities: {
      cardId: string;
      question: string;
      isExercise: boolean;
      topicId: string | null;
      objectiveId: string;
      objectiveTitle: string;
      objectiveImplicit: boolean;
    }[];
  };
  link(input: { linkId: string; objectiveId: string | null; cardIds: readonly string[] }): {
    linked: number;
  };
  panel(input: { objectiveId: string }): ObjectivePanel;
  addRequirement(input: {
    requirementId: string;
    objectiveId: string;
    requiresId: string;
    kind: 'indispensable' | 'recommended';
    status: 'confirmed' | 'suggested';
  }): void;
  confirmRequirement(input: { requirementId: string }): void;
  dismissRequirement(input: { requirementId: string }): void;
  knowAlready(input: { objectiveId: string }): void;
  postpone(input: { objectiveId: string }): void;
  resume(input: { objectiveId: string }): void;
}

export function createObjectivesStore(db: ReteniaDatabase, clock: Clock): ObjectivesStore {
  const { orm } = db;

  const objectiveRow = (tx: Writer, objectiveId: string) => {
    const row = tx
      .select()
      .from(objectives)
      .where(and(eq(objectives.id, objectiveId), isNull(objectives.deletedAt)))
      .get();
    if (!row) {
      throw new ObjectiveNotFoundError();
    }
    return row;
  };

  // La materia de un objetivo (tuyo o implícito).
  const subjectOfRef = (tx: Writer, ref: string): string => {
    if (ref.startsWith('subject:')) {
      return ref.slice('subject:'.length);
    }
    if (ref.startsWith('topic:')) {
      const topic = tx
        .select({ subjectId: topics.subjectId })
        .from(topics)
        .where(eq(topics.id, ref.slice('topic:'.length)))
        .get();
      if (!topic) {
        throw new ObjectiveNotFoundError();
      }
      return topic.subjectId;
    }
    return objectiveRow(tx, ref).subjectId;
  };

  const modelOf = (tx: Writer, ref: string) => {
    const snapshot = objectivesSnapshot(tx, subjectOfRef(tx, ref));
    const model = snapshot?.byId.get(ref);
    if (!snapshot || !model) {
      throw new ObjectiveNotFoundError();
    }
    return { snapshot, model };
  };

  // El objetivo tuyo de ahora de una actividad (nulo: el implícito).
  const explicitOf = (tx: Writer, cardId: string): string | null => {
    const last = tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(and(eq(observations.kind, 'objective.linked'), eq(observations.cardId, cardId)))
      .orderBy(observations.seq)
      .all()
      .at(-1);
    return last === undefined
      ? null
      : readPayload('objective.linked', last.schemaVersion, last.payload).objectiveId;
  };

  const linkCards = (
    tx: Writer,
    objectiveId: string | null,
    cardIds: readonly string[],
    keyOf: (cardId: string) => string,
    source: 'user' | 'demo' = 'user',
  ) => {
    let linked = 0;
    for (const cardId of cardIds) {
      const previous = explicitOf(tx, cardId);
      if (previous === objectiveId) {
        continue;
      }
      const { inserted } = appendObservation(tx, clock, {
        kind: 'objective.linked',
        payload: { cardId, objectiveId, previousObjectiveId: previous },
        idempotencyKey: keyOf(cardId),
        source,
      });
      linked += inserted ? 1 : 0;
    }
    return linked;
  };

  const cardsOfSubject = (tx: Writer, subjectId: string, cardIds: readonly string[]) => {
    if (cardIds.length === 0) {
      return;
    }
    const found = tx
      .select({ id: cards.id })
      .from(cards)
      .where(
        and(
          inArray(cards.id, [...cardIds]),
          eq(cards.subjectId, subjectId),
          isNull(cards.deletedAt),
        ),
      )
      .all();
    if (found.length !== new Set(cardIds).size) {
      throw new ObjectivePlaceError();
    }
  };

  const toggle = (objectiveId: string, kind: 'objective.postponed' | 'objective.resumed') => {
    orm.transaction((tx) => {
      const { model } = modelOf(tx, objectiveRow(tx, objectiveId).id);
      if (model.postponed === (kind === 'objective.postponed')) {
        return;
      }
      // La clave cuenta las veces que se pospuso o retomó: el mismo pedido dos veces no agrega otro.
      const times = tx
        .select({ id: observations.id })
        .from(observations)
        .where(
          and(
            eq(observations.objectiveId, objectiveId),
            inArray(observations.kind, ['objective.postponed', 'objective.resumed']),
          ),
        )
        .all().length;
      appendObservation(tx, clock, {
        kind,
        payload: { objectiveId },
        idempotencyKey: `${kind}:${objectiveId}:${times}`,
        source: 'user',
      });
    });
  };

  const requirementById = (tx: Writer, requirementId: string) => {
    const added = tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(eq(observations.idempotencyKey, `requirement:${requirementId}`))
      .get();
    if (!added) {
      throw new RequirementNotFoundError();
    }
    const payload = readPayload('requirement.added', added.schemaVersion, added.payload);
    const { snapshot } = modelOf(tx, payload.objectiveId);
    const requirement = snapshot.requirements.find((r) => r.id === requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError();
    }
    return requirement;
  };

  return {
    list({ subjectId }) {
      const id = subjectFor(orm, subjectId);
      const snapshot = id === null ? null : objectivesSnapshot(orm, id);
      if (!snapshot) {
        return { subject: null, topics: [] };
      }
      const groups = [
        ...snapshot.topics.map((topic) => ({
          topicId: topic.id as string | null,
          name: topic.name as string | null,
        })),
        { topicId: null, name: null },
      ];
      return {
        subject: snapshot.subject,
        topics: groups
          .map((group) => ({
            topicId: group.topicId,
            name: group.name,
            objectives: snapshot.objectives
              .filter((model) => model.topicId === group.topicId)
              .map(summaryOf),
          }))
          .filter((group) => group.objectives.length > 0),
      };
    },

    create({ objectiveId, subjectId, topicId, text, conditions, kind, cardIds }, options = {}) {
      const source = options.source ?? 'user';
      const parsed = parseObjectiveText(text);
      return orm.transaction((tx) => {
        const subject = tx
          .select({ id: subjects.id })
          .from(subjects)
          .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
          .get();
        if (!subject) {
          throw new ObjectivePlaceError();
        }
        if (topicId !== null) {
          const topic = tx
            .select({ id: topics.id })
            .from(topics)
            .where(
              and(
                eq(topics.id, topicId),
                eq(topics.subjectId, subjectId),
                isNull(topics.deletedAt),
              ),
            )
            .get();
          if (!topic) {
            throw new ObjectivePlaceError();
          }
        }
        cardsOfSubject(tx, subjectId, cardIds);
        const trimmed = conditions?.trim() ?? '';
        const inserted = tx
          .insert(objectives)
          .values({
            id: objectiveId,
            subjectId,
            topicId,
            title: parsed.title,
            action: parsed.action,
            content: parsed.content,
            conditions: trimmed === '' ? null : trimmed,
            kind,
            conceptKey: parsed.conceptKey,
            source,
            createdAt: clock.now().toISOString(),
          })
          .onConflictDoNothing({ target: objectives.id })
          .run();
        if (inserted.changes === 1) {
          linkCards(tx, objectiveId, cardIds, (cardId) => `link:${objectiveId}:${cardId}`, source);
        }
        return { objectiveId, observable: parsed.observable };
      });
    },

    activities({ subjectId, topicId }) {
      const snapshot = objectivesSnapshot(orm, subjectId);
      if (!snapshot) {
        return { activities: [] };
      }
      return {
        activities: [...snapshot.cards.values()]
          .filter(
            (card) =>
              !card.deleted && (topicId === undefined || card.topicId === (topicId ?? null)),
          )
          .map((card) => {
            const objective = snapshot.byId.get(snapshot.cardObjective.get(card.id) ?? '');
            return {
              cardId: card.id,
              question: card.question,
              isExercise: card.activityType !== null,
              topicId: card.topicId,
              objectiveId: objective?.id ?? '',
              objectiveTitle: objective?.title ?? '',
              objectiveImplicit: objective?.implicit ?? true,
            };
          }),
      };
    },

    link({ linkId, objectiveId, cardIds }) {
      return orm.transaction((tx) => {
        if (objectiveId !== null) {
          cardsOfSubject(tx, objectiveRow(tx, objectiveId).subjectId, cardIds);
        }
        return {
          linked: linkCards(tx, objectiveId, cardIds, (cardId) => `link:${linkId}:${cardId}`),
        };
      });
    },

    panel({ objectiveId }) {
      const { snapshot, model } = modelOf(orm, objectiveId);
      const backing = estimateBacking(snapshot.estimateOf(model));
      const active = snapshot.requirements.filter((requirement) => !requirement.dismissed);
      const explicitOthers = snapshot.objectives.filter(
        (other) => !other.implicit && other.id !== model.id,
      );
      return {
        objective: {
          ...summaryOf(model),
          action: model.action,
          content: model.content,
          conditions: model.conditions,
        },
        columns: model.mastery.columns,
        nextStep: nextStepOf(model.mastery),
        pendingCheckFrom: model.mastery.pendingCheckFrom,
        checkAvailable:
          model.mastery.pendingCheckFrom !== null &&
          model.mastery.pendingCheckFrom <= studyDayOf(clock.now()),
        estimate: {
          concept: model.conceptName,
          outOfTen: backing.outOfTen,
          observations: backing.observations,
        },
        activities: model.activities.map((card) => ({
          cardId: card.id,
          question: card.question,
          isExercise: card.activityType !== null,
          practicable: isPracticable(card),
        })),
        previousAttempts: model.previousAttempts,
        needs: active
          .filter((requirement) => requirement.objectiveId === model.id)
          .map((requirement) => requirementView(snapshot, requirement)),
        neededBy: active
          .filter((requirement) => requirement.requiresId === model.id)
          .map((requirement) => requirementView(snapshot, requirement)),
        requirementCandidates: model.implicit
          ? []
          : explicitOthers
              .filter(
                (other) =>
                  !active.some((r) => r.objectiveId === model.id && r.requiresId === other.id) &&
                  !wouldCreateCycle(snapshot.requirements, model.id, other.id),
              )
              .map((other) => ({ objectiveId: other.id, title: other.title })),
        dependentCandidates: model.implicit
          ? []
          : explicitOthers
              .filter(
                (other) =>
                  !active.some((r) => r.objectiveId === other.id && r.requiresId === model.id) &&
                  !wouldCreateCycle(snapshot.requirements, other.id, model.id),
              )
              .map((other) => ({ objectiveId: other.id, title: other.title })),
      };
    },

    addRequirement({ requirementId, objectiveId, requiresId, kind, status }) {
      orm.transaction((tx) => {
        const dependent = objectiveRow(tx, objectiveId);
        const required = objectiveRow(tx, requiresId);
        if (dependent.subjectId !== required.subjectId) {
          throw new RequirementNotAllowedError();
        }
        const snapshot = objectivesSnapshot(tx, dependent.subjectId);
        if (!snapshot || wouldCreateCycle(snapshot.requirements, objectiveId, requiresId)) {
          throw new RequirementNotAllowedError();
        }
        appendObservation(tx, clock, {
          kind: 'requirement.added',
          payload: { requirementId, objectiveId, requiresId, kind, status },
          idempotencyKey: `requirement:${requirementId}`,
          source: 'user',
        });
      });
    },

    confirmRequirement({ requirementId }) {
      orm.transaction((tx) => {
        const requirement = requirementById(tx, requirementId);
        if (requirement.dismissed || requirement.status === 'confirmed') {
          return;
        }
        appendObservation(tx, clock, {
          kind: 'requirement.confirmed',
          payload: {
            requirementId,
            objectiveId: requirement.objectiveId,
            requiresId: requirement.requiresId,
          },
          idempotencyKey: `requirement-confirm:${requirementId}`,
          source: 'user',
        });
      });
    },

    dismissRequirement({ requirementId }) {
      orm.transaction((tx) => {
        const requirement = requirementById(tx, requirementId);
        if (requirement.dismissed) {
          return;
        }
        appendObservation(tx, clock, {
          kind: 'requirement.dismissed',
          payload: {
            requirementId,
            objectiveId: requirement.objectiveId,
            requiresId: requirement.requiresId,
          },
          idempotencyKey: `requirement-dismiss:${requirementId}`,
          source: 'user',
        });
      });
    },

    knowAlready({ objectiveId }) {
      orm.transaction((tx) => {
        const { model } = modelOf(tx, objectiveRow(tx, objectiveId).id);
        if (model.mastery.state !== 'not-started') {
          throw new KnowAlreadyNotAllowedError();
        }
        appendObservation(tx, clock, {
          kind: 'objective.know_already',
          payload: { objectiveId },
          idempotencyKey: `know:${objectiveId}`,
          source: 'user',
        });
      });
    },

    postpone({ objectiveId }) {
      toggle(objectiveId, 'objective.postponed');
    },

    resume({ objectiveId }) {
      toggle(objectiveId, 'objective.resumed');
    },
  };
}
