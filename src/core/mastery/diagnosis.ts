import { normalizeShortAnswer } from '../evaluation';
import type { HelpLevel, Verdict } from '../memory';
import type { MasteryState } from './types';

// El diagnóstico tras un fallo (CA-153): antes de tratarlo como olvido, Retenia revisa, en este
// orden, si el intento anterior fue con ayuda o con azar, si la pregunta está marcada como dudosa,
// si falta un requisito y si confundís dos conceptos. Propone una sola acción, con su motivo.

export type DiagnosisAction =
  | 'checkUnaided'
  | 'sendToReview'
  | 'goToRequirement'
  | 'practiceDifference'
  | 'forgotten';

export interface MissingRequirement {
  readonly objectiveId: string;
  readonly title: string;
  readonly state: MasteryState;
}

export interface Confusion {
  readonly cardId: string;
  readonly question: string;
}

export type Diagnosis =
  | { readonly action: 'checkUnaided'; readonly reason: 'previousAided' | 'previousOptions' }
  | { readonly action: 'sendToReview'; readonly reason: 'doubtful' }
  | {
      readonly action: 'goToRequirement';
      readonly reason: 'missingRequirement';
      readonly requirement: MissingRequirement;
    }
  | {
      readonly action: 'practiceDifference';
      readonly reason: 'confusion';
      readonly confusedWith: Confusion;
    }
  | { readonly action: 'forgotten'; readonly reason: 'forgotten' };

export interface DiagnosisInput {
  // El intento anterior válido sobre la misma actividad (nulo si es el primero).
  readonly previous: {
    readonly verdict: Verdict;
    readonly helpLevel: HelpLevel;
    readonly optionsQuestion: boolean;
  } | null;
  // Una duda abierta sobre la tarjeta o «La pregunta era ambigua».
  readonly doubtful: boolean;
  readonly missingRequirement: MissingRequirement | null;
  readonly confusedWith: Confusion | null;
}

const AIDED: readonly HelpLevel[] = ['A2', 'A3', 'A4'];

export function diagnoseFailure(input: DiagnosisInput): Diagnosis {
  if (input.previous?.optionsQuestion) {
    return { action: 'checkUnaided', reason: 'previousOptions' };
  }
  if (input.previous && AIDED.includes(input.previous.helpLevel)) {
    return { action: 'checkUnaided', reason: 'previousAided' };
  }
  if (input.doubtful) {
    return { action: 'sendToReview', reason: 'doubtful' };
  }
  if (input.missingRequirement) {
    return {
      action: 'goToRequirement',
      reason: 'missingRequirement',
      requirement: input.missingRequirement,
    };
  }
  if (input.confusedWith) {
    return { action: 'practiceDifference', reason: 'confusion', confusedWith: input.confusedWith };
  }
  return { action: 'forgotten', reason: 'forgotten' };
}

// Si lo escrito es la respuesta (o una variante) de otra tarjeta: la primera que coincida, sin
// mayúsculas, tildes ni espacios.
export function confusionOf(
  written: string,
  others: readonly { cardId: string; question: string; answers: readonly string[] }[],
): Confusion | null {
  const key = normalizeShortAnswer(written);
  if (key === '') {
    return null;
  }
  const match = others.find((other) =>
    other.answers.some((answer) => normalizeShortAnswer(answer) === key),
  );
  return match ? { cardId: match.cardId, question: match.question } : null;
}
