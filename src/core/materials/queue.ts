// La cola de los materiales (H-25, CA-105): una tarea por etapa y por unidad, guardada en la base.
// Estas son sus reglas, sin base: qué tarea sigue, qué pasa cuando una falla y qué pasa con una que
// quedó «en curso» porque Retenia se cerró a mitad de camino.

export type TaskStatus = 'pending' | 'running' | 'done' | 'review' | 'failed' | 'cancelled';

// Por qué falló una tarea. Las deterministas (un PDF dañado, un comprimido trampa) no se
// reintentan: van a dar lo mismo.
export type FailureKind = 'crashed' | 'timeout' | 'memory' | 'unknown' | 'deterministic';

export interface TaskState {
  id: string;
  status: TaskStatus;
  attempts: number;
  recoveries: number;
  // Qué arranque de Retenia la tomó (cada arranque tiene el suyo).
  runnerId: string | null;
  // El último latido, en milisegundos del cronómetro de ese arranque.
  heartbeatAt: number | null;
}

// 3 intentos en total: tras 2 reintentos fallidos, la unidad queda «Requiere revisión».
export const MAX_ATTEMPTS = 3;
// Una tarea vuelve a «pendiente» sin contar como intento hasta 3 veces (cerrar Retenia no es culpa
// de la página); después, cada vuelta cuenta como intento fallido.
export const MAX_RECOVERIES = 3;
export const HEARTBEAT_MS = 2000;
export const STALE_MS = 15_000;

export function startTask(task: TaskState, runnerId: string, now: number): TaskState {
  return { ...task, status: 'running', attempts: task.attempts + 1, runnerId, heartbeatAt: now };
}

export function failTask(task: TaskState, kind: FailureKind): TaskState {
  if (kind === 'deterministic') {
    return { ...task, status: 'failed', runnerId: null, heartbeatAt: null };
  }
  const status = task.attempts >= MAX_ATTEMPTS ? 'review' : 'pending';
  return { ...task, status, runnerId: null, heartbeatAt: null };
}

// Una tarea «en curso» de otro arranque vuelve a «pendiente» enseguida; una del mismo arranque,
// cuando su latido tiene más de 15 s. Devuelve null si no cambia.
export function recoverTask(
  task: TaskState,
  { runnerId, now }: { runnerId: string; now: number },
): TaskState | null {
  if (task.status !== 'running') {
    return null;
  }
  const otherRun = task.runnerId !== runnerId;
  const stale = task.heartbeatAt === null || now - task.heartbeatAt > STALE_MS;
  if (!otherRun && !stale) {
    return null;
  }
  const recoveries = task.recoveries + 1;
  if (recoveries > MAX_RECOVERIES) {
    return { ...failTask(task, 'crashed'), recoveries };
  }
  return {
    ...task,
    status: 'pending',
    attempts: Math.max(0, task.attempts - 1),
    recoveries,
    runnerId: null,
    heartbeatAt: null,
  };
}

export interface QueueEntry {
  id: string;
  status: TaskStatus;
  // Cuándo se agregó el material (el más viejo va primero).
  addedAt: string;
  // El orden de la etapa (validar, extraer, estructura, normalizar, indexar).
  stage: number;
  unit: number;
}

export function pickNext<T extends QueueEntry>(entries: readonly T[]): T | null {
  let best: T | null = null;
  for (const entry of entries) {
    if (entry.status !== 'pending') {
      continue;
    }
    if (
      best === null ||
      entry.addedAt < best.addedAt ||
      (entry.addedAt === best.addedAt &&
        (entry.stage < best.stage || (entry.stage === best.stage && entry.unit < best.unit)))
    ) {
      best = entry;
    }
  }
  return best;
}
