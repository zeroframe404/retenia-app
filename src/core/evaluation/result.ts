import { engineGradeOf, type Grade, gradeOfVerdict, type HelpLevel, type Verdict } from '../memory';
import { topHelp } from './help';
import type { ActivityType, HelpUse } from './types';

// La señal para el motor y el resultado en tres líneas (CA-134): veredicto, qué revisar y una sola
// acción siguiente. Acá van las claves; los textos están en el catálogo.

// Lo que le dice al motor un intento evaluado, con la ayuda ya aplicada. Si cuenta (primer intento
// del día, no un reintento, no afectado) lo decide la proyección.
export function engineSignal(input: {
  verdict: Verdict;
  helpLevel: HelpLevel;
  optionsQuestion: boolean;
}): Grade {
  return (
    engineGradeOf({
      grade: gradeOfVerdict(input.verdict),
      helpLevel: input.helpLevel,
      optionsQuestion: input.optionsQuestion,
    }) ?? 'again'
  );
}

export interface CountedAttempt {
  readonly studyDay: string;
  // Si llegó al motor (el primer intento de su día de estudio).
  readonly counted: boolean;
  readonly verdict: Verdict;
  readonly helpLevel: HelpLevel;
  readonly optionsQuestion: boolean;
  // Evaluado y no afectado (falso si quedó «Sin evaluar» o si «Discrepo» lo dejó sin contar).
  readonly valid?: boolean | undefined;
}

// La comprobación sin ayuda (CA-137): queda pendiente después de un acierto con pista de concepto o
// de paso (haya contado o no para el motor) y se cumple con un acierto sin ayuda que cuente, de un
// día posterior. Un fallo no la cumple.
export function hasPendingCheck(attempts: readonly CountedAttempt[]): boolean {
  let pendingSince: string | null = null;
  for (const attempt of attempts) {
    if (attempt.valid === false || attempt.verdict !== 'correct' || attempt.optionsQuestion) {
      continue;
    }
    if (attempt.helpLevel === 'A2' || attempt.helpLevel === 'A3') {
      pendingSince = attempt.studyDay;
    } else if (
      (attempt.helpLevel === 'A0' || attempt.helpLevel === 'A1') &&
      attempt.counted &&
      pendingSince !== null &&
      attempt.studyDay > pendingSince
    ) {
      pendingSince = null;
    }
  }
  return pendingSince !== null;
}

type VerdictKey =
  | 'correct'
  | 'partial'
  | 'incorrect'
  | 'hintConcept'
  | 'hintStep'
  | 'example'
  | 'source'
  | 'solution';

type ReviewKey =
  | 'nothing'
  | 'orientingUsed'
  | 'helpUsed'
  | 'optionsChance'
  | 'letters'
  | 'number'
  | 'unit'
  | 'unreadable'
  | 'optionExplanation'
  | 'steps'
  | 'missingUnits';

type ActionKey = 'next' | 'check' | 'retryLater' | 'retry' | 'explanation';

export interface ResultParts {
  readonly verdict: VerdictKey;
  readonly review: ReviewKey;
  readonly action: ActionKey;
}

function correctKey(help: HelpUse | null): VerdictKey {
  switch (help?.level) {
    case 'A4':
      return 'solution';
    case 'A3':
      return help?.kind === 'example' ? 'example' : 'hintStep';
    case 'A2':
      return help?.kind === 'source' ? 'source' : 'hintConcept';
    default:
      return 'correct';
  }
}

const NOT_YET_REVIEW: Record<ActivityType, ReviewKey> = {
  short: 'letters',
  numeric: 'number',
  options: 'optionExplanation',
  order: 'steps',
  open: 'missingUnits',
  procedure: 'steps',
  decision: 'optionExplanation',
  interleaved: 'nothing',
};

export function resultParts(input: {
  type: ActivityType;
  verdict: Verdict;
  used: readonly HelpUse[];
  optionsQuestion: boolean;
  // En una numérica, por qué no: la unidad o que no se reconoció un número.
  numericReason?: 'unreadable' | 'unit' | 'off' | null | undefined;
}): ResultParts {
  const help = topHelp(input.used);
  // Con la solución a la vista no hay «Vas bien.» ni «Correcto.» a secas (al motor llega como «No la
  // sabía»).
  if (input.verdict !== 'incorrect' && help?.level === 'A4') {
    return { verdict: 'solution', review: 'helpUsed', action: 'retryLater' };
  }
  if (input.verdict !== 'correct') {
    const numeric =
      input.type === 'numeric' &&
      (input.numericReason === 'unit' || input.numericReason === 'unreadable')
        ? input.numericReason
        : null;
    return {
      verdict: input.verdict,
      review: numeric ?? NOT_YET_REVIEW[input.type],
      action: input.verdict === 'partial' ? 'retry' : 'explanation',
    };
  }
  const verdict = correctKey(help);
  if (verdict === 'solution') {
    return { verdict, review: 'helpUsed', action: 'retryLater' };
  }
  if (verdict !== 'correct') {
    return { verdict, review: 'helpUsed', action: 'check' };
  }
  if (input.optionsQuestion) {
    return { verdict, review: 'optionsChance', action: 'next' };
  }
  return { verdict, review: help === null ? 'nothing' : 'orientingUsed', action: 'next' };
}
