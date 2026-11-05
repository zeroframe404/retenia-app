// La sesión de estudio (Fase 10): qué tarjetas entran, en qué orden, cuándo vuelve una fallada,
// qué hace «Deshacer» y qué dice el cierre. Reglas puras: sin base de datos ni pantalla.

import type { Grade } from '../memory/types';

// Cuántas tarjetas entran en una sesión (la composición por minutos llega en la Fase 11).
export const SESSION_SIZE = 10;
// Una tarjeta fallada vuelve después de al menos estas otras (o al final si quedan menos).
export const RETRY_GAP = 3;

export interface QueueCandidate {
  readonly cardId: string;
  readonly recall: number;
  readonly siblingGroupId: string | null;
  readonly dueDay: string;
}

export interface SessionActivity {
  readonly activityId: string;
  readonly cardId: string;
  readonly retry: boolean;
}

export type SessionOutcome = Grade | 'flagged' | 'dropped';

export interface DoneActivity extends SessionActivity {
  readonly outcome: SessionOutcome;
  readonly reviewId: string | null;
  readonly retryActivityId: string | null;
}

export type SessionStatus = 'active' | 'paused' | 'finished' | 'abandoned';

export interface SessionState {
  readonly sessionId: string;
  readonly subjectId: string;
  readonly studyDay: string;
  readonly status: SessionStatus;
  readonly pending: readonly SessionActivity[];
  readonly done: readonly DoneActivity[];
  readonly undoable: { reviewId: string; cardId: string; grade: Grade } | null;
  readonly progress: { done: number; total: number };
  readonly complete: boolean;
  readonly activeMs: number;
  readonly deferredSiblingIds: readonly string[];
}

export type SessionEvent =
  | {
      readonly kind: 'started';
      readonly sessionId: string;
      readonly subjectId: string;
      readonly studyDay: string;
      readonly activities: readonly { activityId: string; cardId: string }[];
      readonly deferredSiblingIds: readonly string[];
      readonly activeMs: number;
    }
  | {
      readonly kind: 'graded';
      readonly reviewId: string;
      readonly activityId: string;
      readonly grade: Grade;
      readonly retryActivityId: string | null;
      readonly activeMs: number;
    }
  | { readonly kind: 'annulled'; readonly reviewId: string; readonly activeMs: number }
  | { readonly kind: 'skipped'; readonly activityId: string; readonly activeMs: number }
  | { readonly kind: 'flagged'; readonly activityId: string; readonly activeMs: number }
  | { readonly kind: 'dropped'; readonly activityId: string; readonly activeMs: number }
  | {
      readonly kind: 'paused' | 'resumed' | 'finished' | 'abandoned';
      readonly activeMs: number;
    };

export function chooseSessionCards(
  _candidates: readonly QueueCandidate[],
  _options: { size?: number; studiedGroups?: ReadonlySet<string> } = {},
): { chosen: string[]; deferred: string[] } {
  throw new Error('todavía no');
}

export function leftOutOfQueue(_results: readonly Grade[]): boolean {
  throw new Error('todavía no');
}

export function projectSession(_events: readonly SessionEvent[]): SessionState {
  throw new Error('todavía no');
}

export function activeMinutes(_ms: number): number {
  throw new Error('todavía no');
}

export interface SessionSummary {
  readonly results: { good: number; hard: number; again: number; flagged: number };
  readonly difficulties: readonly {
    topicName: string | null;
    cardIds: readonly string[];
    questions: readonly string[];
  }[];
  readonly focusTopicName: string | null;
}

export function summarizeSession(
  _state: SessionState,
  _cards: ReadonlyMap<string, { question: string; topicName: string | null }>,
): SessionSummary {
  throw new Error('todavía no');
}
