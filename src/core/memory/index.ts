import { type MemoryTrace, traceCardMemoryV2 } from './engine';
import type { CardHistoryInput, CardMemory, Grade, MemoryConfig } from './types';
import { projectV1 } from './v1';

// El motor de memoria (H-15): ts-fsrs con FSRS-6 y sus parámetros por defecto, envuelto en reglas
// puras. Recibe todo por parámetro (el historial de la tarjeta, la retención objetivo y el día de
// hoy) y devuelve su estado (estabilidad, dificultad), la próxima fecha y la probabilidad estimada
// de recordarla hoy. No lee la hora del sistema ni toca la base.
//
// Hay dos versiones. La 1 es la de las Fases 03 a 08 y queda para recalcular lo que se calculó con
// ella. La 2 (Fase 09, engine.ts) es la que usa Retenia: días de estudio, un solo repaso por día,
// la ayuda, las anulaciones, la retención de la materia y la variación al azar del uso real.

export {
  ACTIVE_RETENTION,
  type AppearanceRule,
  appearanceRule,
  type DueExplanation,
  daysBetween,
  engineGradeOf,
  explainDue,
  GENERAL_ESTIMATE_ATTEMPTS,
  MAINTENANCE_RETENTION,
  MEMORY_PARAMETERS,
  MEMORY_PARAMETERS_VERSION,
  type MemoryTrace,
  outOfTen,
  recallProbability,
  retentionForSubject,
} from './engine';
export type { CardMemory, Grade, HelpLevel, MemoryConfig, MemoryEvent } from './types';
export { newCardMemory, reviewCard } from './v1';

export const DEFAULT_RETENTION = 0.9;

// La versión del motor con la que se calcula la agenda. Se guarda en la agenda de cada tarjeta y
// junto a cada intento.
export const MEMORY_ENGINE_VERSION = 2;

export class UnknownEngineError extends Error {
  constructor(version: number) {
    super(`No conozco la versión ${version} del motor de memoria`);
    this.name = 'UnknownEngineError';
  }
}

// La agenda de una tarjeta como proyección: se recalcula entera desde sus eventos, la
// configuración y la versión del motor, en el orden canónico. Da lo mismo que haber repasado
// uno por uno en el momento, así «Verificar datos» la puede comparar con la guardada.
export function projectCardMemory(
  input: CardHistoryInput,
  config: MemoryConfig,
  engineVersion: number,
): CardMemory {
  if (engineVersion === 1) {
    return projectV1(input.createdAt, input.events, config);
  }
  if (engineVersion !== MEMORY_ENGINE_VERSION) {
    throw new UnknownEngineError(engineVersion);
  }
  return traceCardMemoryV2(input, config).memory;
}

// La agenda y, además, qué pasó con cada intento (si contó y por qué), para el historial, «¿Por qué
// hoy?» y lo que se guarda junto a cada intento. Siempre con la versión vigente del motor.
export function traceCardMemory(input: CardHistoryInput, config: MemoryConfig): MemoryTrace {
  return traceCardMemoryV2(input, config);
}

// Cómo se calificó un repaso (la evaluación) y con qué botón se repasa la tarjeta.
export type Verdict = 'correct' | 'partial' | 'incorrect';

const VERDICTS: Record<Grade, Verdict> = { good: 'correct', hard: 'partial', again: 'incorrect' };
const GRADES: Record<Verdict, Grade> = { correct: 'good', partial: 'hard', incorrect: 'again' };

export function verdictOfGrade(grade: Grade): Verdict {
  return VERDICTS[grade];
}

export function gradeOfVerdict(verdict: Verdict): Grade {
  return GRADES[verdict];
}
