import { randomUUID } from 'node:crypto';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';
import { buildCutChild, type CutChild, runCut } from '../apoyo/corte';
import { inBuenosAires } from '../apoyo/fechas';

// CA-068 y CA-017 en la sesión de estudio (Fase 10): cortar el proceso a la fuerza antes de cada
// sentencia de cada escritura de la sesión (empezar, calificar, deshacer, marcar la tarjeta,
// saltar, pausar, el borrador, la valoración y la duda), o recién terminada, deja la escritura
// entera o ausente. Nunca un intento perdido a medias ni duplicado: la sesión que se ve al volver
// es la de antes o la de después.

let child: CutChild | undefined;
let folder: ReturnType<typeof tempDataFolder>;
const bases = { open: '', last: '' };
const ids = { session: '', current: '', lastSession: '', lastActivity: '', card: '' };

const open = (dataDir: string) =>
  openWorkspace({ dataDir, clock: demoClock(), appVersion: '0.0.0-prueba' });

// Una materia activa con `count` tarjetas vencidas hoy (repasadas con «La sabía» hace 3 días).
function withDueCards(workspace: Workspace, count: number) {
  const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const cards = Array.from({ length: count }, (_, index) =>
    workspace.cards.create({
      question: `¿Pregunta ${index + 1}?`,
      answer: `Respuesta ${index + 1}`,
      subjectId: subject.id,
    }),
  );
  workspace.cards.plantHistory(
    cards.map((card) => ({
      cardId: card.id,
      createdAt: inBuenosAires('01/03/2027 10:00'),
      reviews: [{ at: inBuenosAires('12/03/2027 10:00'), grade: 'good' as const }],
    })),
  );
  return cards;
}

beforeAll(async () => {
  folder = tempDataFolder();
  child = await buildCutChild();

  // Una sesión de 10 a medias: la primera fallada (con su vuelta en la cola) y un borrador.
  bases.open = join(folder.folder, 'abierta');
  const workspace = open(bases.open);
  withDueCards(workspace, 12);
  ids.session = randomUUID();
  const view = workspace.study.start({ sessionId: ids.session });
  workspace.study.grade({
    sessionId: ids.session,
    activityId: view.current?.activityId ?? '',
    attemptId: randomUUID(),
    grade: 'again',
    answer: null,
  });
  const now = workspace.study.view({ sessionId: ids.session }).current;
  ids.current = now?.activityId ?? '';
  ids.card = now?.cardId ?? '';
  workspace.study.saveDraft({
    sessionId: ids.session,
    activityId: ids.current,
    text: 'cuánto',
    answerShown: false,
  });
  workspace.close();

  // Una sesión a la que le queda una sola tarjeta: calificarla la termina.
  bases.last = join(folder.folder, 'ultima');
  const other = open(bases.last);
  withDueCards(other, 1);
  ids.lastSession = randomUUID();
  ids.lastActivity = other.study.start({ sessionId: ids.lastSession }).current?.activityId ?? '';
  other.close();
}, 60_000);

afterAll(() => {
  child?.remove();
  folder?.remove();
});

// Lo que dice la base, sin identificadores.
function fingerprint(dataDir: string) {
  const file = join(dataDir, 'retenia.db');
  const all = (sql: string) => readRows(file, sql);
  return {
    observations: all('SELECT kind, schema_version FROM observations ORDER BY seq'),
    evaluations: all('SELECT verdict FROM evaluations ORDER BY seq'),
    operations: all('SELECT kind FROM operations ORDER BY seq'),
    versions: all(
      'SELECT v.question, v.sheet_state FROM cards c JOIN card_versions v ON v.id = c.current_version_id ORDER BY v.question',
    ),
    schedule: all('SELECT due_at, reps, lapses, state FROM card_schedule ORDER BY due_at, reps'),
    drafts: all('SELECT text, answer_shown FROM session_drafts ORDER BY text'),
    doubts: all('SELECT text FROM doubts ORDER BY text'),
    settings: all('SELECT key, value FROM settings ORDER BY key'),
    lastSeq: all('SELECT last_seq FROM ledger_state')[0]?.last_seq,
  };
}

let copies = 0;
function copyOf(base: string): string {
  copies += 1;
  const target = join(folder.folder, `copia-${copies}`);
  cpSync(base, target, { recursive: true });
  return target;
}

// La sesión como se ve al volver a abrir.
function sessionAfter(dataDir: string, sessionId: string) {
  const workspace = open(dataDir);
  try {
    const view = workspace.study.view({ sessionId });
    return {
      integrity: workspace.integrityCheck(),
      differences: workspace.verifyData(),
      view: {
        status: view.status,
        progress: view.progress,
        current: view.current?.activityId ?? null,
        draft: view.current?.draft ?? null,
      },
    };
  } finally {
    workspace.close();
  }
}

async function cutEverywhere(
  base: string,
  operation: string,
  data: Record<string, string>,
  sessionId: string,
) {
  if (!child) {
    throw new Error('El programa hijo no se armó');
  }
  const cutChild = child;
  const before = fingerprint(base);
  const beforeView = sessionAfter(copyOf(base), sessionId).view;
  const wholeDir = copyOf(base);
  const whole = await runCut(cutChild, wholeDir, operation, 0, data);
  expect(whole.done, whole.stderr).toBe(true);
  const after = fingerprint(wholeDir);
  const afterView = sessionAfter(wholeDir, sessionId).view;
  expect(after, 'la escritura cambió algo').not.toEqual(before);

  const points = [...Array.from({ length: whole.statements }, (_, index) => index + 1), -1];
  const outcomes: { cutAt: number; state: 'antes' | 'después' }[] = [];
  for (let start = 0; start < points.length; start += 4) {
    await Promise.all(
      points.slice(start, start + 4).map(async (cutAt) => {
        const dataDir = copyOf(base);
        const outcome = await runCut(cutChild, dataDir, operation, cutAt, data);
        expect(outcome.done, `corte ${cutAt}: el proceso tenía que morir`).toBe(false);
        const state = fingerprint(dataDir);
        expect([before, after], `corte ${cutAt}`).toContainEqual(state);
        const reopened = sessionAfter(dataDir, sessionId);
        expect(reopened.integrity, `corte ${cutAt}`).toBe('ok');
        expect(reopened.differences, `corte ${cutAt}`).toEqual([]);
        const isBefore = JSON.stringify(state) === JSON.stringify(before);
        expect(reopened.view, `corte ${cutAt}`).toEqual(isBefore ? beforeView : afterView);
        outcomes.push({ cutAt, state: isBefore ? 'antes' : 'después' });
      }),
    );
  }
  const sorted = [...outcomes].sort((a, b) =>
    a.cutAt === -1 ? 1 : b.cutAt === -1 ? -1 : a.cutAt - b.cutAt,
  );
  expect(sorted[0]?.state).toBe('antes');
  expect(sorted.at(-1)?.state).toBe('después');
  const firstAfter = sorted.findIndex((outcome) => outcome.state === 'después');
  expect(sorted.slice(firstAfter).every((outcome) => outcome.state === 'después')).toBe(true);
  return { points: whole.statements };
}

describe('corte del proceso en cada punto de una escritura de la sesión', () => {
  it('[CA-068] [CA-069] calificar: el repaso, su evaluación, la agenda y el avance de la sesión quedan enteros o ausentes', async () => {
    const { points } = await cutEverywhere(
      bases.open,
      'studyGrade',
      {
        sessionId: ids.session,
        activityId: ids.current,
        attemptId: randomUUID(),
        grade: 'good',
        answer: 'cuánto se alejan',
      },
      ids.session,
    );
    expect(points).toBeGreaterThanOrEqual(6);
  }, 180_000);

  it('[CA-068] [CA-070] calificar «No la sabía» con su vuelta en la cola queda entero o ausente', async () => {
    await cutEverywhere(
      bases.open,
      'studyGrade',
      {
        sessionId: ids.session,
        activityId: ids.current,
        attemptId: randomUUID(),
        grade: 'again',
      },
      ids.session,
    );
  }, 180_000);

  it('[CA-068] [CA-074] calificar la última tarjeta deja la sesión terminada con su repaso, o como estaba', async () => {
    await cutEverywhere(
      bases.last,
      'studyGrade',
      {
        sessionId: ids.lastSession,
        activityId: ids.lastActivity,
        attemptId: randomUUID(),
        grade: 'good',
      },
      ids.lastSession,
    );
  }, 180_000);

  it.for([
    { title: 'empezar otra sesión', operation: 'studyStart', extra: { sessionId: 'nueva' } },
    { title: '«Deshacer»', operation: 'studyUndo', extra: {} },
    { title: '«La tarjeta está mal»', operation: 'studyFlag', extra: { attemptId: 'nuevo' } },
    { title: '«Saltar»', operation: 'studySkip', extra: {} },
    { title: '«Pausar»', operation: 'studyPause', extra: {} },
    { title: 'el borrador', operation: 'studyDraft', extra: { text: 'cuánto se alejan' } },
    { title: '«¿Cómo estuvo?»', operation: 'studyRate', extra: { ratingId: 'nuevo' } },
    { title: '«Guardar una duda»', operation: 'doubt', extra: { doubtId: 'nuevo' } },
  ] as const)(
    '[CA-068] cortar el proceso en cada punto de $title deja el cambio entero o ausente',
    { timeout: 180_000 },
    async ({ operation, extra }) => {
      const data: Record<string, string> = {
        sessionId: ids.session,
        activityId: ids.current,
        cardId: ids.card,
        text: 'No entiendo por qué se divide por n−1',
      };
      for (const [key, value] of Object.entries(extra)) {
        data[key] = value === 'nuevo' || value === 'nueva' ? randomUUID() : value;
      }
      await cutEverywhere(bases.open, operation, data, ids.session);
    },
  );
});
