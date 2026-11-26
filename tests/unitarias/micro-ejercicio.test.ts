import { describe, expect, it } from 'vitest';
import {
  MICRO_ITEMS,
  type MicroEvent,
  projectMicro,
  proposableMicro,
  sessionPasses,
} from '../../src/core/micro';

// El micro-ejercicio (Fase 18, CA-166): el mismo tipo de error 2 veces en problemas distintos lo
// propone; se supera con 2 sesiones al 85 % o más sin pistas, en días distintos. Después el punto
// vuelve dentro de una actividad completa, sin aviso.

const POINT = 'proc:limite';
const day = (n: number) => `2027-03-${String(n).padStart(2, '0')}`;

type Short =
  | { error: number; problem: string; point?: string }
  | { session: number; ok: number; of: number; hinted?: number }
  | { practiced: number };

function history(items: readonly Short[]): MicroEvent[] {
  return items.map((item, index) => {
    const base = { id: `e${index}`, seq: index + 1 };
    if ('error' in item) {
      return {
        ...base,
        kind: 'error' as const,
        point: item.point ?? POINT,
        problem: item.problem,
        studyDay: day(item.error),
      };
    }
    if ('session' in item) {
      return {
        ...base,
        kind: 'session' as const,
        point: POINT,
        studyDay: day(item.session),
        items: Array.from({ length: item.of }, (_, n) => ({
          ok: n < item.ok,
          hinted: n < (item.hinted ?? 0),
        })),
      };
    }
    return { ...base, kind: 'practiced' as const, point: POINT, studyDay: day(item.practiced) };
  });
}

const stateOf = (items: readonly Short[]) => projectMicro(history(items)).get(POINT);

const TWO_ERRORS: Short[] = [
  { error: 15, problem: 'v1' },
  { error: 15, problem: 'v2' },
];

describe('el micro-ejercicio', () => {
  it('es corto: entre 5 y 10 ítems', () => {
    expect(MICRO_ITEMS).toBeGreaterThanOrEqual(5);
    expect(MICRO_ITEMS).toBeLessThanOrEqual(10);
  });

  it('[CA-166] el mismo error 2 veces en problemas distintos lo activa, aunque sea el mismo día', () => {
    expect(stateOf([{ error: 15, problem: 'v1' }])?.status).toBe('watching');
    expect(stateOf(TWO_ERRORS)?.status).toBe('active');
  });

  it('[CA-166] dos veces en el mismo problema, o dos errores distintos, no alcanzan', () => {
    expect(
      stateOf([
        { error: 15, problem: 'v1' },
        { error: 16, problem: 'v1' },
      ])?.status,
    ).toBe('watching');
    expect(
      [
        ...projectMicro(
          history([
            { error: 15, problem: 'v1' },
            { error: 15, problem: 'v2', point: 'proc:margen' },
          ]),
        ).values(),
      ].map((point) => point.status),
    ).toEqual(['watching', 'watching']);
  });

  it('[CA-166] una sesión vale con el 85 % o más acertado sin pistas', () => {
    const items = (ok: number, of: number, hinted = 0) =>
      Array.from({ length: of }, (_, n) => ({ ok: n < ok, hinted: n < hinted }));
    expect(sessionPasses(items(7, 7))).toBe(true);
    expect(sessionPasses(items(6, 7))).toBe(true);
    expect(sessionPasses(items(5, 7))).toBe(false);
    expect(sessionPasses(items(17, 20))).toBe(true);
    expect(sessionPasses(items(4, 5))).toBe(false);
    // Un acierto con pista no cuenta.
    expect(sessionPasses(items(7, 7, 2))).toBe(false);
    // Con menos de 5 ítems no es una sesión del micro-ejercicio.
    expect(sessionPasses(items(4, 4))).toBe(false);
  });

  it('[CA-166] se supera con 2 sesiones buenas separadas por un día o más', () => {
    const oneDay = [...TWO_ERRORS, { session: 15, ok: 7, of: 7 }, { session: 15, ok: 7, of: 7 }];
    expect(stateOf(oneDay)).toMatchObject({ status: 'active', goodDays: [day(15)] });
    expect(
      stateOf([...TWO_ERRORS, { session: 15, ok: 7, of: 7 }, { session: 16, ok: 6, of: 7 }])
        ?.status,
    ).toBe('passed');
    expect(
      stateOf([...TWO_ERRORS, { session: 15, ok: 7, of: 7 }, { session: 16, ok: 5, of: 7 }]),
    ).toMatchObject({ status: 'active', goodDays: [day(15)] });
  });

  it('después de superarlo, el punto queda para volver dentro de una actividad completa, una sola vez', () => {
    const passed: Short[] = [
      ...TWO_ERRORS,
      { session: 15, ok: 7, of: 7 },
      { session: 16, ok: 7, of: 7 },
    ];
    expect(stateOf(passed)).toMatchObject({ status: 'passed', pendingReturn: true });
    expect(stateOf([...passed, { practiced: 17 }])).toMatchObject({
      status: 'passed',
      pendingReturn: false,
    });
    // Los errores de antes no cuentan: hacen falta dos nuevos.
    expect(stateOf([...passed, { error: 18, problem: 'v3' }])?.status).toBe('watching');
    expect(
      stateOf([...passed, { error: 18, problem: 'v3' }, { error: 19, problem: 'v4' }]),
    ).toMatchObject({ status: 'active', goodDays: [], pendingReturn: false });
  });

  it('se propone al cierre el que está activo y no se hizo hoy; primero el del último error', () => {
    const state = projectMicro(
      history([
        { error: 14, problem: 'a1', point: 'proc:margen' },
        { error: 14, problem: 'a2', point: 'proc:margen' },
        ...TWO_ERRORS,
      ]),
    );
    expect(proposableMicro(state, day(15))).toBe(POINT);
    const done = projectMicro(history([...TWO_ERRORS, { session: 15, ok: 2, of: 7 }]));
    expect(proposableMicro(done, day(15))).toBeNull();
    expect(proposableMicro(done, day(16))).toBe(POINT);
    expect(proposableMicro(projectMicro([]), day(15))).toBeNull();
  });
});
