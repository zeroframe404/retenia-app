import type {
  AmendmentNotice,
  AttemptDetail,
  DiagnosisValue,
  ResultPartsValue,
  VerdictValue,
} from '../../preload/contract/activities';
import { formatLongDate, texts } from '../../preload/contract/texts';

// De las claves del resultado (que decide el principal con las reglas del núcleo) a lo que se lee
// en pantalla: siempre tres líneas, veredicto, qué revisar y una sola acción siguiente (CA-134).

const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6 });
export const formatNumber = (value: number) => decimal.format(value);

// El tono del componente «Resultado» (los de ui/Evaluation): «Todavía no.» nunca va en rojo.
type ResultTone = 'correct' | 'on-track' | 'not-yet' | 'unsure';

export function toneOf(verdict: VerdictValue): ResultTone {
  return verdict === 'correct' ? 'correct' : verdict === 'partial' ? 'on-track' : 'not-yet';
}

export function verdictText(parts: ResultPartsValue): string {
  return texts.practice.verdicts[parts.verdict];
}

export function reviewText(
  parts: ResultPartsValue,
  detail: AttemptDetail | null,
  missing: readonly string[],
): string {
  const review = texts.practice.review;
  switch (parts.review) {
    case 'nothing':
      return review.nothing;
    case 'orientingUsed':
      return review.orientingUsed;
    case 'helpUsed':
      return parts.verdict === 'correct' ||
        parts.verdict === 'partial' ||
        parts.verdict === 'incorrect'
        ? review.nothing
        : review.helpUsed[parts.verdict];
    case 'optionsChance':
      return review.optionsChance;
    case 'letters':
      return detail?.type === 'short'
        ? review.letters(detail.written.trim(), detail.expected)
        : review.nothing;
    case 'number':
      return detail?.type === 'numeric'
        ? review.number(formatNumber(detail.expected), formatNumber(detail.tolerance), detail.unit)
        : review.nothing;
    case 'unit':
      return review.unit(detail?.type === 'numeric' ? detail.unit : null);
    case 'unreadable':
      return review.unreadable;
    case 'optionExplanation':
      return review.optionExplanation(
        detail?.type === 'options' || detail?.type === 'decision' ? detail.explanation : null,
      );
    case 'steps':
      return review.steps;
    case 'missingUnits':
      return review.missingUnits(missing);
  }
}

export function actionText(parts: ResultPartsValue, checkDay: string | null): string {
  const actions = texts.practice.actions;
  switch (parts.action) {
    case 'next':
      return actions.next;
    case 'check':
      return checkDay === null ? actions.checkNoDay : actions.check(formatLongDate(checkDay));
    case 'retryLater':
      return actions.retryLater;
    case 'retry':
      return actions.retry;
    case 'explanation':
      return actions.explanation;
  }
}

// Tras un fallo (Fase 17, CA-153): la acción siguiente y su motivo, en una sola línea.
export function diagnosisText(diagnosis: DiagnosisValue): string {
  const text = texts.practice.diagnosis;
  switch (diagnosis.action) {
    case 'checkUnaided':
      return diagnosis.reason === 'previousOptions' ? text.previousOptions : text.previousAided;
    case 'sendToReview':
      return text.doubtful;
    case 'goToRequirement':
      return text.missingRequirement(
        diagnosis.requirement.title,
        STATE_NAMES[diagnosis.requirement.state],
      );
    case 'practiceDifference':
      return text.confusion(diagnosis.confusedWith.question);
    case 'forgotten':
      return text.forgotten;
  }
}

const STATE_NAMES = {
  'not-started': texts.ui.mastery.notStarted,
  'in-practice': texts.ui.mastery.inPractice,
  'to-review': texts.ui.mastery.toReview,
  enough: texts.ui.mastery.enough,
  consolidated: texts.ui.mastery.consolidated,
} as const;

// El aviso de evaluación corregida (CA-141): «Todavía no → Correcto» y el efecto en el próximo
// repaso.
export function noticeTexts(notice: AmendmentNotice): {
  before: string;
  after: string;
  effect: string;
} {
  const names = texts.practice.noticeVerdicts;
  let effect: string;
  if (notice.inReview) {
    effect = texts.practice.effectInReview;
  } else if (notice.after === 'notCounted') {
    effect = texts.practice.effectNotCounted;
  } else if (notice.dueAfter === null) {
    effect = texts.practice.effectNoReview;
  } else if (notice.dueBefore === null) {
    effect = texts.practice.effectFirst(formatLongDate(notice.dueAfter));
  } else if (notice.dueBefore === notice.dueAfter) {
    effect = texts.practice.effectUnchanged(formatLongDate(notice.dueAfter));
  } else {
    effect = texts.practice.effectChanged(
      formatLongDate(notice.dueBefore),
      formatLongDate(notice.dueAfter),
    );
  }
  return { before: names[notice.before], after: names[notice.after], effect };
}
