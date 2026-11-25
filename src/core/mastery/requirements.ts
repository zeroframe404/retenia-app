import { inCanonicalOrder } from '../ledger';
import type { MasteryState } from './types';

// Los requisitos entre objetivos (H-35) y la frontera de lo disponible. Un requisito tiene tipo
// (indispensable o recomendable) y estado (confirmado o sugerido). Solo un indispensable confirmado
// cuyo objetivo está debajo de «Suficiente para avanzar» frena: el objetivo queda fuera de la
// frontera y Estudiar empieza por el requisito. Los demás solo avisan («Quizá te ayude
// repasar…»). «Esto no es necesario para aquello» lo descarta al instante; nada se borra: todo
// queda en el historial.

export type RequirementKind = 'indispensable' | 'recommended';
export type RequirementStatus = 'confirmed' | 'suggested';

export type RequirementEvent =
  | {
      readonly kind: 'added';
      readonly id: string;
      readonly seq: number;
      readonly requirementId: string;
      readonly objectiveId: string;
      readonly requiresId: string;
      readonly requirementKind: RequirementKind;
      readonly status: RequirementStatus;
    }
  | {
      readonly kind: 'confirmed' | 'dismissed';
      readonly id: string;
      readonly seq: number;
      readonly requirementId: string;
    };

export interface Requirement {
  readonly id: string;
  readonly objectiveId: string;
  readonly requiresId: string;
  readonly kind: RequirementKind;
  readonly status: RequirementStatus;
  readonly dismissed: boolean;
  // Cuándo se agregó, en el orden de registro.
  readonly seq: number;
}

// Los requisitos como quedan después de su historial. Agregar uno que ya existe (el mismo par de
// objetivos, sin descartar) lo reemplaza: queda uno solo, con el tipo y el estado nuevos.
export function foldRequirements(events: readonly RequirementEvent[]): Requirement[] {
  const byId = new Map<string, Requirement>();
  for (const event of inCanonicalOrder(events)) {
    if (event.kind === 'added') {
      for (const [id, existing] of byId) {
        if (
          !existing.dismissed &&
          existing.objectiveId === event.objectiveId &&
          existing.requiresId === event.requiresId
        ) {
          byId.set(id, { ...existing, dismissed: true });
        }
      }
      byId.set(event.requirementId, {
        id: event.requirementId,
        objectiveId: event.objectiveId,
        requiresId: event.requiresId,
        kind: event.requirementKind,
        status: event.status,
        dismissed: false,
        seq: event.seq,
      });
      continue;
    }
    const existing = byId.get(event.requirementId);
    if (existing) {
      byId.set(
        event.requirementId,
        event.kind === 'confirmed'
          ? { ...existing, status: 'confirmed' }
          : { ...existing, dismissed: true },
      );
    }
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

// Un requisito está cumplido desde «Suficiente para avanzar» (también «(por verificar)»).
export function isMet(state: MasteryState): boolean {
  return state === 'enough' || state === 'consolidated';
}

export function blocks(requirement: Requirement): boolean {
  return (
    !requirement.dismissed &&
    requirement.kind === 'indispensable' &&
    requirement.status === 'confirmed'
  );
}

export interface FrontierObjective {
  readonly id: string;
  readonly state: MasteryState;
  // «No quiero esto ahora».
  readonly postponed: boolean;
}

export interface Frontier {
  // Lo que se puede estudiar ahora: ni frenado ni pospuesto.
  readonly available: readonly string[];
  // Por objetivo frenado, los requisitos que lo frenan (sin cumplir).
  readonly blocked: ReadonlyMap<string, readonly Requirement[]>;
  // Por objetivo, los requisitos sin cumplir que solo avisan.
  readonly warnings: ReadonlyMap<string, readonly Requirement[]>;
}

export function frontier(input: {
  objectives: readonly FrontierObjective[];
  requirements: readonly Requirement[];
}): Frontier {
  const stateOf = new Map(input.objectives.map((objective) => [objective.id, objective.state]));
  const blocked = new Map<string, Requirement[]>();
  const warnings = new Map<string, Requirement[]>();
  for (const requirement of input.requirements) {
    const required = stateOf.get(requirement.requiresId);
    if (requirement.dismissed || required === undefined || isMet(required)) {
      continue;
    }
    const into = blocks(requirement) ? blocked : warnings;
    into.set(requirement.objectiveId, [...(into.get(requirement.objectiveId) ?? []), requirement]);
  }
  const available = input.objectives
    .filter((objective) => !objective.postponed && !blocked.has(objective.id))
    .map((objective) => objective.id);
  return { available, blocked, warnings };
}

// Si «objetivo necesita a requisito» armaría un círculo (o es el mismo objetivo).
export function wouldCreateCycle(
  requirements: readonly Requirement[],
  objectiveId: string,
  requiresId: string,
): boolean {
  const active = requirements.filter((requirement) => !requirement.dismissed);
  const seen = new Set<string>();
  const pending = [requiresId];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (current === objectiveId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const requirement of active) {
      if (requirement.objectiveId === current) {
        pending.push(requirement.requiresId);
      }
    }
  }
  return false;
}
