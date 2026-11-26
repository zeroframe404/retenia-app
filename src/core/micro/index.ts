import { inCanonicalOrder } from '../ledger';

// El micro-ejercicio (CA-166): cuando el mismo tipo de error aparece 2 veces en problemas
// distintos, al cierre se propone un bloque corto sobre ese punto. Se supera con 2 sesiones al 85 %
// o más sin pistas, en días de estudio distintos. Después el punto vuelve a aparecer dentro de una
// actividad completa, sin aviso.

// Cuántos ítems tiene un bloque (entre 5 y 10: con 7 se puede fallar uno).
export const MICRO_ITEMS = 7;
export const MICRO_MIN_ITEMS = 5;
const PASS_PERCENT = 85;
const ERRORS_TO_START = 2;
const SESSIONS_TO_PASS = 2;

export interface MicroItem {
  readonly ok: boolean;
  readonly hinted: boolean;
}

export function sessionPasses(items: readonly MicroItem[]): boolean {
  const good = items.filter((item) => item.ok && !item.hinted).length;
  return items.length >= MICRO_MIN_ITEMS && good * 100 >= PASS_PERCENT * items.length;
}

interface Dated {
  readonly id: string;
  readonly seq: number;
  readonly point: string;
  readonly studyDay: string;
}

export type MicroEvent =
  // Un error en ese punto. `problem` dice en qué problema (una variante es otro problema).
  | (Dated & { readonly kind: 'error'; readonly problem: string })
  // Una sesión terminada del micro-ejercicio.
  | (Dated & { readonly kind: 'session'; readonly items: readonly MicroItem[] })
  // El punto apareció dentro de una actividad completa.
  | (Dated & { readonly kind: 'practiced' });

export interface MicroPoint {
  readonly point: string;
  // «watching»: todavía no hay dos errores; «active»: se propone; «passed»: superado.
  readonly status: 'watching' | 'active' | 'passed';
  // Los días con una sesión buena desde que se activó.
  readonly goodDays: readonly string[];
  readonly lastSessionDay: string | null;
  readonly lastErrorSeq: number;
  // Superado y todavía no volvió dentro de una actividad completa.
  readonly pendingReturn: boolean;
}

interface Draft {
  point: string;
  status: MicroPoint['status'];
  problems: Set<string>;
  goodDays: string[];
  lastSessionDay: string | null;
  lastErrorSeq: number;
  pendingReturn: boolean;
}

export function projectMicro(events: readonly MicroEvent[]): Map<string, MicroPoint> {
  const points = new Map<string, Draft>();
  for (const event of inCanonicalOrder(events)) {
    const draft = points.get(event.point) ?? {
      point: event.point,
      status: 'watching' as const,
      problems: new Set<string>(),
      goodDays: [],
      lastSessionDay: null,
      lastErrorSeq: 0,
      pendingReturn: false,
    };
    points.set(event.point, draft);
    if (event.kind === 'error') {
      if (draft.status === 'passed') {
        // Volvió a fallar después de superarlo: se cuenta de nuevo.
        draft.status = 'watching';
        draft.problems = new Set();
        draft.goodDays = [];
        draft.lastSessionDay = null;
        draft.pendingReturn = false;
      }
      draft.problems.add(event.problem);
      draft.lastErrorSeq = event.seq;
      if (draft.status === 'watching' && draft.problems.size >= ERRORS_TO_START) {
        draft.status = 'active';
      }
    } else if (event.kind === 'session') {
      if (draft.status !== 'active') {
        continue;
      }
      draft.lastSessionDay = event.studyDay;
      if (sessionPasses(event.items) && !draft.goodDays.includes(event.studyDay)) {
        draft.goodDays.push(event.studyDay);
        if (draft.goodDays.length >= SESSIONS_TO_PASS) {
          draft.status = 'passed';
          draft.problems = new Set();
          draft.pendingReturn = true;
        }
      }
    } else {
      draft.pendingReturn = false;
    }
  }
  return new Map(
    [...points].map(([key, { problems: _problems, ...point }]) => [
      key,
      { ...point, goodDays: [...point.goodDays] },
    ]),
  );
}

// El que se propone al cierre: activo y sin sesión hoy (dos el mismo día no suman); si hay varios,
// el del error más reciente.
export function proposableMicro(
  points: ReadonlyMap<string, MicroPoint>,
  today: string,
): string | null {
  const open = [...points.values()]
    .filter(
      (point) =>
        point.status === 'active' &&
        (point.lastSessionDay === null || point.lastSessionDay < today),
    )
    .sort((a, b) => b.lastErrorSeq - a.lastErrorSeq);
  return open[0]?.point ?? null;
}
