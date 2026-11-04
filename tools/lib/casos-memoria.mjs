// La tabla de casos del motor de memoria (CA-059): leer una secuencia escrita en castellano
// («tarjeta nueva, La sabía el 15/03, La sabía en su fecha, No la sabía en su fecha»), calcularla
// con la biblioteca ts-fsrs y con la fórmula publicada de FSRS-6 (tools/lib/fsrs6.mjs), y leer o
// agregar renglones del archivo de referencia (docs/especificacion/casos-memoria.md).
//
// Las reglas de Retenia encima del motor (los días de estudio, un solo repaso por día, la ayuda,
// las anulaciones, el reinicio cuando cambió lo que hay que recordar) están escritas acá de nuevo,
// a propósito aparte de src/core/memory: la tabla se genera sin el código que después la tiene que
// reproducir.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as formula from './fsrs6.mjs';

const require = createRequire(import.meta.url);
/** @type {typeof import('ts-fsrs')} */
const tsfsrs = require('ts-fsrs');

/** @typedef {'again' | 'hard' | 'good'} Grade */
/** @typedef {'A0' | 'A1' | 'A2' | 'A3' | 'A4'} HelpLevel */
/**
 * @typedef {{ kind: 'date', day: string }
 *   | { kind: 'due' }
 *   | { kind: 'sameDay' }
 *   | { kind: 'late', days: number }
 *   | { kind: 'early', days: number }} When
 */
/**
 * @typedef {{ kind: 'review', grade: Grade, when: When | null, help: HelpLevel, defective: boolean }
 *   | { kind: 'interrupted', when: When | null }
 *   | { kind: 'undo' }
 *   | { kind: 'reset', when: When | null }} Step
 */
/** @typedef {{ maintenance: boolean, steps: Step[] }} Sequence */

/** El día en que se crea la tarjeta de cada caso: el «hoy» de la demostración. */
export const CASE_START_DAY = '2027-03-15';
/** Retención objetivo de la materia activa y de una en mantenimiento. */
const ACTIVE_RETENTION = 0.9;
const MAINTENANCE_RETENTION = 0.85;

export class SequenceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SequenceError';
  }
}

const BUTTONS = /** @type {const} */ ([
  ['no la sabía', 'again'],
  ['con dudas', 'hard'],
  ['la sabía', 'good'],
]);

const HELP = /** @type {const} */ ([
  [/\bcon (?:una |la )?pregunta orientadora\b/, 'A1'],
  [/\bcon (?:una |la )?pista de concepto\b/, 'A2'],
  [/\bcon (?:una |la )?pista de paso\b/, 'A3'],
  [/\b(?:con|viendo) un ejemplo\b/, 'A3'],
  [/\b(?:con la solución vista|viendo la solución|con la solución)\b/, 'A4'],
  [/\bsin ayuda\b/, 'A0'],
]);

const DEFECTIVE = /\b(?:con )?(?:la tarjeta )?marcada como defectuosa\b|\bla tarjeta está mal\b/;

/** @param {string} text */
function numberOf(text) {
  if (/^(?:un|una|uno)$/.test(text)) {
    return 1;
  }
  return Number(text);
}

/**
 * Saca de `rest` lo que dice cuándo fue y lo devuelve junto con lo que sobra.
 * @param {string} rest
 * @returns {{ when: When | null, rest: string }}
 */
function takeWhen(rest) {
  const date = /\bel (\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(rest);
  if (date) {
    const [, d = '', m = '', y = '2027'] = date;
    const day = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const real = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (real.toISOString().slice(0, 10) !== day) {
      throw new SequenceError(`La fecha «${date[0]}» no existe`);
    }
    return { when: { kind: 'date', day }, rest: rest.replace(date[0], ' ') };
  }
  const late =
    /\b(\d+|un|una|uno) días? (?:tarde|de atraso|después de su fecha|despues de su fecha|más tarde)\b/.exec(
      rest,
    );
  if (late) {
    return {
      when: { kind: 'late', days: numberOf(late[1] ?? '') },
      rest: rest.replace(late[0], ' '),
    };
  }
  const early = /\b(\d+|un|una|uno) días? (?:antes(?: de su fecha)?|adelantad[oa]s?)\b/.exec(rest);
  if (early) {
    return {
      when: { kind: 'early', days: numberOf(early[1] ?? '') },
      rest: rest.replace(early[0], ' '),
    };
  }
  for (const [pattern, kind] of /** @type {const} */ ([
    [/\ben (?:su|la) fecha\b|\bcuando vence\b|\bel día que vence\b/, 'due'],
    [/\bel mismo día\b|\bese mismo día\b|\bahí nomás\b/, 'sameDay'],
  ])) {
    const found = pattern.exec(rest);
    if (found) {
      return { when: { kind }, rest: rest.replace(found[0], ' ') };
    }
  }
  return { when: null, rest };
}

/** @param {string} rest @param {string} original */
function assertNothingLeft(rest, original) {
  const left = rest.replace(/\s+/g, ' ').trim();
  if (left !== '') {
    throw new SequenceError(`No entendí «${left}» en «${original}»`);
  }
}

/**
 * Un paso de la secuencia.
 * @param {string} chunk lo que hay entre comas, en minúsculas
 * @param {string} original el mismo texto como se escribió
 * @returns {Step}
 */
function parseStep(chunk, original) {
  if (/^(?:deshacer|deshago|anular|anulo)(?: (?:el )?(?:último )?repaso)?$/.test(chunk)) {
    return { kind: 'undo' };
  }
  const reset = /^cambió lo que hay que recordar\b(.*)$/.exec(chunk);
  if (reset) {
    const { when, rest } = takeWhen(reset[1] ?? '');
    assertNothingLeft(rest, original);
    return { kind: 'reset', when };
  }
  const interrupted = /^(?:(?:un )?intento )?interrumpido\b(.*)$/.exec(chunk);
  if (interrupted) {
    const { when, rest } = takeWhen(interrupted[1] ?? '');
    assertNothingLeft(rest, original);
    return { kind: 'interrupted', when };
  }
  const button = BUTTONS.find(([label]) => chunk === label || chunk.startsWith(`${label} `));
  if (!button) {
    throw new SequenceError(
      `No entendí «${original}»: cada paso empieza con «La sabía», «Con dudas», «No la sabía», «interrumpido», «deshacer» o «cambió lo que hay que recordar»`,
    );
  }
  let rest = chunk.slice(button[0].length);
  const taken = takeWhen(rest);
  rest = taken.rest;
  /** @type {HelpLevel} */
  let help = 'A0';
  for (const [pattern, level] of HELP) {
    const found = pattern.exec(rest);
    if (found) {
      help = level;
      rest = rest.replace(found[0], ' ');
      break;
    }
  }
  const defective = DEFECTIVE.exec(rest);
  if (defective) {
    rest = rest.replace(defective[0], ' ');
  }
  assertNothingLeft(rest, original);
  return {
    kind: 'review',
    grade: button[1],
    when: taken.when,
    help,
    defective: defective !== null,
  };
}

/**
 * Lee una secuencia escrita en castellano. La primera parte dice qué tarjeta («tarjeta nueva»,
 * «tarjeta nueva de una materia en mantenimiento»); se puede omitir y entonces es una tarjeta nueva
 * de la materia activa. Después, separados por comas (o por «y» antes del último), los pasos.
 * @param {string} text
 * @returns {Sequence}
 */
export function parseSequence(text) {
  const chunks = text
    .trim()
    .replace(/[.;]+$/, '')
    .split(
      /,|\s+y\s+(?=(?:la sabía|con dudas|no la sabía|deshacer|anular|interrumpido|intento|cambió)\b)/i,
    )
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '');
  if (chunks.length === 0) {
    throw new SequenceError('La secuencia está vacía');
  }
  let maintenance = false;
  const first = (chunks[0] ?? '').toLowerCase();
  if (/^(?:una )?tarjeta nueva\b/.test(first)) {
    const qualifier = first.replace(/^(?:una )?tarjeta nueva\b/, '').trim();
    if (/mantenimiento/.test(qualifier)) {
      maintenance = true;
    } else if (qualifier !== '' && !/^(?:de|en) (?:la )?materia activa$/.test(qualifier)) {
      throw new SequenceError(`No entendí «${chunks[0]}»`);
    }
    chunks.shift();
  }
  const steps = chunks.map((chunk) =>
    parseStep(
      chunk
        .toLowerCase()
        .replace(/^(?:después|despues|luego|otra vez|y)\s+/, '')
        .replace(/\s+/g, ' '),
      chunk,
    ),
  );
  if (!steps.some((step) => step.kind === 'review')) {
    throw new SequenceError('La secuencia no tiene ningún repaso');
  }
  return { maintenance, steps };
}

// --- Fechas: días de estudio como AAAA-MM-DD ---

/** @param {string} day @param {number} n */
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** @param {string} later @param {string} earlier */
function daysBetween(later, earlier) {
  return Math.round(
    (Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000,
  );
}

/** @param {string} day */
export function formatDay(day) {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** Lo que muestra la tabla cuando la tarjeta quedó sin repasar (nueva). */
export const UNREVIEWED = 'sin repasar';

// --- Las reglas de Retenia encima del motor ---

/**
 * Lo que le llega al motor de un intento: la ayuda cambia la calificación (CA-064) y un intento
 * interrumpido o de una tarjeta marcada como defectuosa no mueve nada.
 * @param {{ grade: Grade, help: HelpLevel, defective?: boolean, interrupted?: boolean }} attempt
 * @returns {Grade | null}
 */
function engineGradeOf(attempt) {
  if (attempt.interrupted || attempt.defective) {
    return null;
  }
  if (attempt.help === 'A4') {
    return 'again';
  }
  if ((attempt.help === 'A2' || attempt.help === 'A3') && attempt.grade === 'good') {
    return 'hard';
  }
  return attempt.grade;
}

/**
 * @typedef {{ kind: 'review', day: string, grade: Grade | null, annulled: boolean }
 *   | { kind: 'reset', day: string }} TimelineEvent
 * @typedef {{ stability: number, difficulty: number, interval: number, lastDay: string, reps: number, lapses: number }} Projected
 * @typedef {(previous: Projected | null, day: string, grade: Grade, retention: number) => Projected} Scheduler
 */

const GRADE_NUMBER = /** @type {const} */ ({ again: 1, hard: 2, good: 3 });

/**
 * Con la biblioteca: ts-fsrs con FSRS-6, parámetros por defecto, sin variación al azar y sin pasos
 * de minutos (`enable_short_term` con los pasos vacíos), contando los días como días de estudio.
 * @type {Scheduler}
 */
const libraryScheduler = (previous, day, grade, retention) => {
  const f = tsfsrs.fsrs(
    tsfsrs.generatorParameters({
      request_retention: retention,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: [],
      relearning_steps: [],
    }),
  );
  const noon = (/** @type {string} */ d) => new Date(`${d}T12:00:00Z`);
  const card =
    previous === null
      ? tsfsrs.createEmptyCard(noon(day))
      : {
          due: noon(addDays(previous.lastDay, previous.interval)),
          stability: previous.stability,
          difficulty: previous.difficulty,
          elapsed_days: 0,
          scheduled_days: previous.interval,
          learning_steps: 0,
          reps: previous.reps,
          lapses: previous.lapses,
          state: tsfsrs.State.Review,
          last_review: noon(previous.lastDay),
        };
  const next = f.next(card, noon(day), GRADE_NUMBER[grade]).card;
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    interval: next.scheduled_days,
    lastDay: day,
    reps: next.reps,
    lapses: next.lapses,
  };
};

/**
 * Con la fórmula publicada (tools/lib/fsrs6.mjs), sin la biblioteca.
 * @type {Scheduler}
 */
const formulaScheduler = (previous, day, grade, retention) => {
  const t = previous === null ? 0 : daysBetween(day, previous.lastDay);
  const next = formula.review(previous, t, GRADE_NUMBER[grade], retention);
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    interval: next.interval,
    lastDay: day,
    reps: (previous?.reps ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (grade === 'again' && previous !== null ? 1 : 0),
  };
};

/**
 * Recalcula la tarjeta desde sus eventos, en orden: un repaso anulado no cuenta, uno que el motor
 * no toma (ayuda o interrupción) tampoco, solo el primero de cada día de estudio llega al motor, y
 * un reinicio la deja como nueva.
 * @param {readonly TimelineEvent[]} events @param {number} retention @param {Scheduler} scheduler
 * @returns {Projected | null}
 */
function replay(events, retention, scheduler) {
  /** @type {Projected | null} */
  let current = null;
  for (const event of events) {
    if (event.kind === 'reset') {
      current = null;
      continue;
    }
    if (event.annulled || event.grade === null) {
      continue;
    }
    if (current !== null && event.day <= current.lastDay) {
      continue;
    }
    current = scheduler(current, event.day, event.grade, retention);
  }
  return current;
}

/**
 * Corre una secuencia paso a paso: después de cada paso, el día del próximo repaso (o «sin
 * repasar») y la memoria con que quedó la tarjeta.
 * @param {Sequence} sequence @param {Scheduler} scheduler
 * @returns {{ due: string[], final: Projected | null, events: TimelineEvent[], days: (string | null)[] }}
 */
function runSequence(sequence, scheduler) {
  const retention = sequence.maintenance ? MAINTENANCE_RETENTION : ACTIVE_RETENTION;
  /** @type {TimelineEvent[]} */
  const events = [];
  /** @type {string[]} */
  const due = [];
  /** @type {(string | null)[]} */
  const days = [];
  let lastEventDay = CASE_START_DAY;
  let reviewed = false;
  for (const step of sequence.steps) {
    const current = replay(events, retention, scheduler);
    const dueDay = current === null ? lastEventDay : addDays(current.lastDay, current.interval);
    /** @param {When | null} when */
    const dayOf = (when) => {
      if (when === null) {
        return reviewed ? dueDay : CASE_START_DAY;
      }
      switch (when.kind) {
        case 'date':
          return when.day;
        case 'due':
          return dueDay;
        case 'sameDay':
          return lastEventDay;
        case 'late':
          return addDays(dueDay, when.days);
        case 'early':
          return addDays(dueDay, -when.days);
      }
    };
    if (step.kind === 'undo') {
      const last = [...events].reverse().find((e) => e.kind === 'review' && !e.annulled);
      if (last?.kind !== 'review') {
        throw new SequenceError('«Deshacer» sin un repaso antes');
      }
      last.annulled = true;
      days.push(null);
    } else if (step.kind === 'reset') {
      // Sin fecha, el cambio se hace el mismo día del último paso.
      const day = dayOf(step.when ?? { kind: 'sameDay' });
      events.push({ kind: 'reset', day });
      lastEventDay = day;
      days.push(day);
    } else {
      const day = dayOf(step.when);
      const grade =
        step.kind === 'interrupted'
          ? null
          : engineGradeOf({ grade: step.grade, help: step.help, defective: step.defective });
      events.push({ kind: 'review', day, grade, annulled: false });
      lastEventDay = day;
      reviewed = true;
      days.push(day);
    }
    const after = replay(events, retention, scheduler);
    due.push(after === null ? UNREVIEWED : formatDay(addDays(after.lastDay, after.interval)));
  }
  return { due, final: replay(events, retention, scheduler), events, days };
}

// --- El archivo de referencia ---

/** Dónde vive la tabla congelada. @param {string} root */
export function casesFile(root) {
  return join(root, 'docs', 'especificacion', 'casos-memoria.md');
}

const ROW = /^\| (C\d{2,}) \| (.+?) \| (.+?) \| (.+?) \|$/;

/**
 * @typedef {{ id: string, sequence: string, expected: string[], memory: string }} CaseRow
 */

/** Los renglones de la tabla, en orden. @param {string} text @returns {CaseRow[]} */
export function readCases(text) {
  return text
    .split(/\r?\n/)
    .map((line) => ROW.exec(line.trim()))
    .filter((match) => match !== null)
    .map(([, id = '', sequence = '', expected = '', memory = '']) => ({
      id,
      sequence: sequence.trim(),
      expected: expected.split(' · ').map((part) => part.trim()),
      memory: memory.trim(),
    }));
}

/** Estabilidad y dificultad con coma decimal y cuatro decimales. @param {Projected | null} final */
function memoryText(final) {
  if (final === null) {
    return 'nueva';
  }
  const f = (/** @type {number} */ n) => n.toFixed(4).replace('.', ',');
  return `${f(final.stability)} · ${f(final.difficulty)}`;
}

/**
 * Calcula un caso con la biblioteca y lo revisa contra la fórmula publicada. Devuelve el renglón
 * (sin identificador) o tira un error si las dos no coinciden.
 * @param {string} sequenceText
 */
export function computeCase(sequenceText) {
  const sequence = parseSequence(sequenceText);
  const library = runSequence(sequence, libraryScheduler);
  const checked = runSequence(sequence, formulaScheduler);
  if (library.due.join('|') !== checked.due.join('|')) {
    throw new SequenceError(
      `La biblioteca da ${library.due.join(' · ')} y la fórmula publicada ${checked.due.join(' · ')}`,
    );
  }
  const close = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-6;
  if (
    (library.final === null) !== (checked.final === null) ||
    (library.final !== null &&
      checked.final !== null &&
      (!close(library.final.stability, checked.final.stability) ||
        !close(library.final.difficulty, checked.final.difficulty)))
  ) {
    throw new SequenceError(
      `La biblioteca y la fórmula publicada no dan la misma memoria: ${memoryText(library.final)} y ${memoryText(checked.final)}`,
    );
  }
  return { expected: library.due, memory: memoryText(library.final) };
}

/**
 * Agrega un caso al final de la tabla con el identificador que sigue y devuelve el renglón.
 * @param {string} root @param {string} sequenceText
 */
export function appendCase(root, sequenceText) {
  const file = casesFile(root);
  const text = readFileSync(file, 'utf8');
  const rows = readCases(text);
  const shown = sequenceText
    .trim()
    .replace(/[.;]+$/, '')
    .replace(/\s+/g, ' ');
  if (rows.some((row) => row.sequence.toLowerCase() === shown.toLowerCase())) {
    throw new SequenceError(`Ese caso ya está en la tabla: «${shown}»`);
  }
  const { expected, memory } = computeCase(shown);
  const next = rows.reduce((max, row) => Math.max(max, Number(row.id.slice(1))), 0) + 1;
  const id = `C${String(next).padStart(2, '0')}`;
  const line = `| ${id} | ${shown.replaceAll('|', '/')} | ${expected.join(' · ')} | ${memory} |`;
  const lines = text.split(/\r?\n/);
  // Después del último renglón, o del encabezado si la tabla todavía está vacía.
  const lastRow = lines.reduce(
    (last, l, index) => (ROW.test(l.trim()) || /^\|(?:---\|){4}$/.test(l.trim()) ? index : last),
    -1,
  );
  if (lastRow === -1) {
    throw new SequenceError('No encontré la tabla de casos en el archivo de referencia');
  }
  lines.splice(lastRow + 1, 0, line);
  writeFileSync(file, lines.join('\n'));
  return { id, sequence: shown, expected, memory, line };
}
