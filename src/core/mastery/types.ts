import type { HelpLevel, Verdict } from '../memory';

// Los tipos del dominio (Fase 17, H-34 a H-36): los objetivos, sus estados y la evidencia que los
// decide.

// Recordar, Comprender, Aplicar, Razonar y Ejecutar.
export type ObjectiveKind = 'remember' | 'understand' | 'apply' | 'reason' | 'execute';

// Los cinco escalones, en el orden del mapa: Sin iniciar (1), En práctica (2), A revisar (3),
// Suficiente para avanzar (4) y Consolidado (5). «(por verificar)» es una marca aparte, no un
// sexto estado.
export type MasteryState = 'not-started' | 'in-practice' | 'to-review' | 'enough' | 'consolidated';

// Cómo terminó un intento, según su evaluación vigente: acierto, «Vas bien.» o «Con dudas»
// (práctica, ni acierto ni fallo) y fallo.
export type Outcome = 'success' | 'partial' | 'failure';

// Un intento sobre una actividad del objetivo, con lo que dice su evaluación vigente (con
// enmiendas). `valid` es falso si quedó sin evaluar, si se anuló («Deshacer») o si «Discrepo» lo
// dejó sin contar.
export interface MasteryAttempt {
  readonly kind: 'attempt';
  readonly id: string;
  readonly seq: number;
  readonly studyDay: string;
  readonly activityId: string;
  readonly verdict: Verdict;
  readonly helpLevel: HelpLevel;
  readonly optionsQuestion: boolean;
  readonly valid: boolean;
}

// «Ya lo sé» sobre el objetivo.
export interface KnowAlready {
  readonly kind: 'knowAlready';
  readonly id: string;
  readonly seq: number;
  readonly studyDay: string;
}

export type MasteryEvent = MasteryAttempt | KnowAlready;
