import { and, eq, inArray } from 'drizzle-orm';
import { type ActivityType, maxHelpLevel } from '../core/evaluation';
import { type HelpLevel, type Verdict, verdictOfGrade } from '../core/memory';
import { studyDayOf } from '../core/study-day';
import { readPayload, type StoredPayload } from './ledger';
import type { Writer } from './orm';
import { currentVerdicts, evaluationColumns } from './projections';
import { cards, cardVersions, evaluations, observations } from './schema';

// La evidencia de una materia (Fase 17): cada intento sobre sus tarjetas y ejercicios, con su
// evaluación vigente (con enmiendas), para decidir el estado de sus objetivos, la estimación de sus
// conceptos, la dificultad recurrente y «Mis errores». Solo lectura y en pocas consultas: la
// materia entera de una vez.

const EVIDENCE_KINDS = ['review.graded', 'attempt.submitted', 'review.annulled'];

export interface EvidenceAttempt {
  readonly id: string;
  readonly seq: number;
  readonly cardId: string;
  readonly occurredAt: Date;
  readonly studyDay: string;
  // Un repaso de tarjeta («me califico») o un intento sobre un ejercicio.
  readonly source: 'review' | 'attempt';
  // La evaluación vigente (nula si quedó sin evaluar).
  readonly verdict: Verdict | null;
  readonly helpLevel: HelpLevel;
  readonly optionsQuestion: boolean;
  // Cuenta como evidencia: evaluado, no anulado, no afectado y no una vuelta ni un «Reintentar».
  readonly valid: boolean;
  readonly annulled: boolean;
  // «Discrepo» lo dejó sin contar («La pregunta era ambigua», «La referencia es incorrecta»).
  readonly affected: boolean;
  // Lo que se escribió: la respuesta de un ejercicio o «Tu respuesta…» de un repaso.
  readonly written: string | null;
  readonly activityType: ActivityType | null;
  readonly versionId: string | null;
  // Fase 18: era una variante que no habías visto.
  readonly newVariant: boolean;
  // La ayuda que pediste. En un procedimiento, los pasos resueltos del escalón no la cuentan.
  readonly barHelp: HelpLevel;
}

export interface SubjectCard {
  readonly id: string;
  readonly topicId: string | null;
  readonly createdAt: string;
  readonly question: string;
  readonly answer: string;
  readonly variants: readonly string[];
  readonly activityType: ActivityType | null;
  readonly sheetState: string;
  readonly pausedAt: string | null;
  readonly deleted: boolean;
  readonly hasCite: boolean;
  readonly activity: string | null;
  readonly versionId: string;
}

const listOf = (json: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

// Las tarjetas y ejercicios de una materia (también las que están en la Papelera, marcadas: su
// evidencia no se borra), con su versión vigente.
export function subjectCards(db: Writer, subjectId: string): SubjectCard[] {
  return db
    .select({
      id: cards.id,
      topicId: cards.topicId,
      createdAt: cards.createdAt,
      pausedAt: cards.pausedAt,
      deletedAt: cards.deletedAt,
      versionId: cardVersions.id,
      activity: cardVersions.activity,
      question: cardVersions.question,
      answer: cardVersions.answer,
      variants: cardVersions.variants,
      activityType: cardVersions.activityType,
      sheetState: cardVersions.sheetState,
      sourceCite: cardVersions.sourceCite,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .where(eq(cards.subjectId, subjectId))
    .orderBy(cards.createdAt, cards.id)
    .all()
    .map((row) => ({
      id: row.id,
      topicId: row.topicId,
      createdAt: row.createdAt,
      pausedAt: row.pausedAt,
      deleted: row.deletedAt !== null,
      versionId: row.versionId,
      activity: row.activity,
      question: row.question,
      answer: row.answer,
      variants: listOf(row.variants),
      activityType: row.activityType as ActivityType | null,
      sheetState: row.sheetState,
      hasCite: row.sourceCite !== null,
    }));
}

function writtenOf(answer: StoredPayload<'attempt.submitted'>['answer']): string {
  switch (answer.type) {
    case 'short':
    case 'open':
      return answer.text;
    case 'numeric':
      return answer.raw;
    case 'options':
    case 'decision':
      return answer.optionId;
    case 'order':
      return answer.stepIds.join(' · ');
    case 'procedure':
      return answer.steps.map((step) => step.written).join(' · ');
  }
}

// Los intentos de las tarjetas de una materia (o de las tarjetas pedidas), por tarjeta, en el orden
// de registro.
export function subjectEvidence(
  db: Writer,
  scope: { subjectId: string } | { cardIds: readonly string[] },
): Map<string, EvidenceAttempt[]> {
  const where =
    'subjectId' in scope
      ? and(eq(cards.subjectId, scope.subjectId), inArray(observations.kind, EVIDENCE_KINDS))
      : scope.cardIds.length === 0
        ? undefined
        : and(
            inArray(observations.cardId, [...scope.cardIds]),
            inArray(observations.kind, EVIDENCE_KINDS),
          );
  const byCard = new Map<string, EvidenceAttempt[]>();
  if (where === undefined) {
    return byCard;
  }
  const rows = db
    .select({
      id: observations.id,
      kind: observations.kind,
      seq: observations.seq,
      occurredAt: observations.occurredAt,
      payload: observations.payload,
      schemaVersion: observations.schemaVersion,
    })
    .from(observations)
    // Sin la tarjeta (ya se vació de la Papelera) los intentos siguen: son evidencia.
    .leftJoin(cards, eq(cards.id, observations.cardId))
    .where(where)
    .orderBy(observations.seq)
    .all();
  const verdicts = currentVerdicts(
    db
      .select(evaluationColumns)
      .from(evaluations)
      .innerJoin(observations, eq(observations.id, evaluations.attemptId))
      .leftJoin(cards, eq(cards.id, observations.cardId))
      .where(where)
      .all(),
  );
  const annulled = new Set(
    rows
      .filter((row) => row.kind === 'review.annulled')
      .map((row) => readPayload('review.annulled', row.schemaVersion, row.payload).reviewId),
  );
  for (const row of rows) {
    if (row.kind === 'review.annulled') {
      continue;
    }
    const occurredAt = new Date(row.occurredAt);
    const current = verdicts.get(row.id);
    let attempt: EvidenceAttempt;
    if (row.kind === 'attempt.submitted') {
      const payload = readPayload('attempt.submitted', row.schemaVersion, row.payload);
      attempt = {
        id: row.id,
        seq: row.seq,
        cardId: payload.cardId,
        occurredAt,
        studyDay: studyDayOf(occurredAt),
        source: 'attempt',
        verdict: current?.verdict ?? null,
        helpLevel: payload.helpLevel,
        optionsQuestion: payload.optionsQuestion,
        valid: current !== undefined && !current.affected && payload.attemptNo === 1,
        annulled: false,
        affected: current?.affected === true,
        written: writtenOf(payload.answer),
        activityType: payload.activityType,
        versionId: payload.versionId,
        newVariant: payload.variant?.isNew === true,
        barHelp:
          payload.activityType === 'procedure' ? maxHelpLevel(payload.help) : payload.helpLevel,
      };
    } else {
      const payload = readPayload('review.graded', row.schemaVersion, row.payload);
      const isAnnulled = annulled.has(row.id);
      const retry = 'retry' in payload && payload.retry === true;
      attempt = {
        id: row.id,
        seq: row.seq,
        cardId: payload.cardId,
        occurredAt,
        studyDay: studyDayOf(occurredAt),
        source: 'review',
        verdict: current?.verdict ?? verdictOfGrade(payload.grade),
        helpLevel: payload.helpLevel,
        optionsQuestion: false,
        valid: !isAnnulled && current?.affected !== true && !retry,
        annulled: isAnnulled,
        affected: current?.affected === true,
        written: 'answer' in payload ? (payload.answer ?? null) : null,
        activityType: null,
        versionId: payload.versionId ?? null,
        newVariant: false,
        barHelp: payload.helpLevel,
      };
    }
    const list = byCard.get(attempt.cardId);
    if (list) {
      list.push(attempt);
    } else {
      byCard.set(attempt.cardId, [attempt]);
    }
  }
  return byCard;
}
