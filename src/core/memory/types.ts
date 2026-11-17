// Los tipos del motor de memoria, compartidos por sus dos versiones.

// «No la sabía», «Con dudas» y «La sabía». No existe «fácil».
export type Grade = 'again' | 'hard' | 'good';

// La escala única de ayuda: A0 sin ayuda, A1 pregunta orientadora, A2 pista de concepto, A3 pista
// de paso o «Ver un ejemplo», A4 solución vista.
export type HelpLevel = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

export interface CardMemory {
  // 0 = nueva, 2 = en repaso (los números de State de ts-fsrs).
  state: number;
  stability: number;
  difficulty: number;
  dueAt: Date;
  lastReviewAt: Date | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
}

// Lo que mueve la agenda de una tarjeta: un repaso (con la calificación de su evaluación
// vigente), la anulación de un repaso, la agenda que traía de antes del libro mayor (bases de la
// Fase 03) o el reinicio cuando cambió lo que hay que recordar.
export type MemoryEvent =
  | {
      readonly kind: 'review';
      readonly id: string;
      readonly seq: number;
      readonly occurredAt: Date;
      readonly grade: Grade;
      // La ayuda que se usó (A0 si no se dice), si el intento quedó interrumpido y si la tarjeta
      // se marcó como defectuosa (Fase 09, CA-064).
      readonly helpLevel?: HelpLevel | undefined;
      readonly interrupted?: boolean | undefined;
      readonly defective?: boolean | undefined;
      // La vuelta de una fallada dentro de una sesión (Fase 10): queda en el historial y nunca
      // llega al motor, sea el día que sea.
      readonly retry?: boolean | undefined;
      // Si la fecha de este repaso lleva la variación al azar del uso real (Fase 09).
      readonly fuzz?: boolean | undefined;
    }
  | {
      // «Deshacer» un repaso (Fase 09, CA-063): el repaso queda en el historial pero no cuenta.
      readonly kind: 'annulled';
      readonly id: string;
      readonly seq: number;
      readonly reviewId: string;
    }
  | {
      readonly kind: 'adopted';
      readonly id: string;
      readonly seq: number;
      readonly memory: CardMemory;
    }
  // Cambió lo que hay que recordar (Fase 08): la tarjeta se programa como nueva desde ese momento;
  // el historial anterior queda.
  | {
      readonly kind: 'reset';
      readonly id: string;
      readonly seq: number;
      readonly occurredAt: Date;
    };

export interface MemoryConfig {
  // La retención objetivo de la materia de la tarjeta, tomada de su estado al calcular.
  readonly retention: number;
}

// Lo que necesita el motor para recalcular una tarjeta: su identificador (de él sale la semilla de
// la variación al azar), cuándo se creó y sus eventos, en cualquier orden.
export interface CardHistoryInput {
  readonly cardId?: string | undefined;
  readonly createdAt: Date;
  readonly events: readonly MemoryEvent[];
}
