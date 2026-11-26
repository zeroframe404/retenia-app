import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { App } from '../../src/renderer/App';
import { movableClock } from '../apoyo/procedimiento';
import { closeWindows, openWindow } from './apoyo-ventana';

// Las objeciones del revisor sobre los ejercicios en la sesión, en la ventana.

afterEach(closeWindows);

const SLOW = { timeout: 10_000 };

type Window = ReturnType<typeof openWindow>;
type Api = Window['api'];

// «Enviar» y salir del resultado, por el puente (como «Practicar ahora»).
async function practiceShort(api: Api, cardId: string, text: string) {
  const openingId = crypto.randomUUID();
  await api['activities.start']({ cardId, openingId });
  const result = await api['activities.submit']({
    cardId,
    openingId,
    attemptId: crypto.randomUUID(),
    attemptNo: 1,
    answer: { type: 'short', text },
    help: [],
    noIdea: false,
  });
  await api['activities.finalize']({
    attemptId: result.attemptId,
    verdict: result.proposed,
    marked: [],
  });
}

// Una práctica de un procedimiento por el puente: el ejemplo explicado o los pasos vacíos bien.
async function practiceProcedure(api: Api, cardId: string, answers: Record<string, string>) {
  const openingId = crypto.randomUUID();
  await api['activities.start']({ cardId, openingId });
  const view = await api['procedure.open']({ cardId, openingId });
  if (view.rung.kind === 'example') {
    await api['procedure.studied']({
      cardId,
      openingId,
      why: view.steps
        .filter((step) => step.key)
        .map((step) => ({ stepId: step.id, text: 'Porque sí.' })),
    });
    return;
  }
  const checked = await api['procedure.check']({
    cardId,
    openingId,
    attemptId: crypto.randomUUID(),
    answers: view.steps
      .filter((step) => step.blank)
      .map((step) => ({ stepId: step.id, written: answers[step.id] ?? '' })),
    help: [],
    noIdea: false,
  });
  const attemptId = checked.kind === 'error' ? checked.attemptId : checked.correction.attemptId;
  if (checked.kind === 'error') {
    await api['procedure.correction']({ attemptId });
  }
  await api['procedure.finish']({ attemptId, self: [] });
}

// Una materia propia con un procedimiento de 2 pasos al que ya le toca el repaso.
async function withDueProcedure() {
  const clock = movableClock();
  const opened = openWindow('real', clock);
  const { api } = opened;
  const subject = await api['subjects.create']({ name: 'Cuentas', makeActive: true });
  const created = await api['cards.create']({
    question: 'Sumar y duplicar',
    answer: 'x',
    subjectId: subject.id,
    activity: {
      type: 'procedure',
      family: null,
      steps: [
        {
          id: 'a',
          prompt: 'Sumá 2 y 3.',
          expected: { type: 'number', formula: '2 + 3', tolerance: 0, unit: null },
          explanation: 'Dos más tres.',
          key: true,
        },
        {
          id: 'b',
          prompt: 'Duplicá el resultado.',
          expected: { type: 'number', formula: 'paso1 * 2', tolerance: 0, unit: null },
          explanation: 'Por dos.',
          key: false,
        },
      ],
    },
  });
  for (let day = 0; day < 3; day += 1) {
    await practiceProcedure(api, created.id, { a: '5', b: '10' });
    clock.advance(1);
  }
  clock.advance(30);
  return { ...opened, cardId: created.id };
}

// «Empezar», cuando ya se puede tocar (mientras se lee la propuesta está apagado).
async function startFromStudy(user: Window['user']) {
  await waitFor(
    () =>
      expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(false),
    SLOW,
  );
  await user.click(screen.getByRole('button', { name: 'Empezar' }));
}

const theSession = () => screen.findByRole('main', { name: 'Sesión de estudio' }, SLOW);

describe('«Tengo: 5» con un procedimiento solo (objeción 3)', () => {
  it('dice que en 5 minutos no entra y deja elegir otro tiempo', async () => {
    const { user } = await withDueProcedure();
    render(<App />);
    const minutes = await screen.findByRole('group', { name: 'Tengo:' }, SLOW);
    await user.click(within(minutes).getByRole('button', { name: '5' }));
    await screen.findByText(
      'En 5 minutos no entra ninguno de los repasos de hoy. Probá con más tiempo.',
      {},
      SLOW,
    );
    expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText(/^Hoy no tenés repasos vencidos/)).toBeNull();
    await user.click(
      within(screen.getByRole('group', { name: 'Tengo:' })).getByRole('button', {
        name: '25',
      }),
    );
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(
          false,
        ),
      SLOW,
    );
  });
});

describe('pausar a mitad de un procedimiento (objeción 6)', () => {
  it('al continuar vuelve a «Hay un error en el paso 2» y se puede terminar la corrección', async () => {
    const { user } = await withDueProcedure();
    render(<App />);
    await startFromStudy(user);
    let session = await theSession();
    await user.type(
      await within(session).findByRole('textbox', { name: 'Paso 2: tu resultado' }, SLOW),
      '99',
    );
    await user.click(within(session).getByRole('button', { name: 'Enviar' }));
    await within(session).findByText('Hay un error en el paso 2; ¿lo encontrás?', {}, SLOW);
    await user.click(within(session).getByRole('button', { name: 'Pausar' }));
    await user.click(
      await screen.findByRole('button', { name: /^Continuar: sesión de hoy/ }, SLOW),
    );
    session = await theSession();
    await within(session).findByText('Hay un error en el paso 2; ¿lo encontrás?', {}, SLOW);
    const written = within(session).getByRole('textbox', {
      name: 'Paso 2: tu resultado',
    }) as HTMLInputElement;
    expect(written.value).toBe('99');
    await user.click(within(session).getByRole('button', { name: 'Ver la corrección' }));
    await user.click(
      await within(session).findByRole('button', { name: 'Ver el resultado' }, SLOW),
    );
    await user.click(await within(session).findByRole('button', { name: 'Siguiente' }, SLOW));
    await screen.findByRole('heading', { name: /^Sesión terminada/ }, SLOW);
    expect(screen.getByText('No la sabía: 1')).toBeTruthy();
  });
});

// El 16/03 con el elenco: la sesión parada en su primer ejercicio.
async function atFirstExercise() {
  const opened = openWindow('real', demoClock(1), { withCast: 'tarjetas' });
  const sessionId = crypto.randomUUID();
  let view = await opened.api['study.start']({ sessionId, minutes: 25 });
  while (view.current && view.current.card.activityType === null) {
    view = await opened.api['study.grade']({
      sessionId,
      activityId: view.current.activityId,
      attemptId: crypto.randomUUID(),
      grade: 'good',
      answer: null,
    });
  }
  await opened.api['study.pause']({ sessionId });
  render(<App />);
  await opened.user.click(
    await screen.findByRole('button', { name: /^Continuar: sesión de hoy/ }, SLOW),
  );
  const session = await theSession();
  await within(session).findByRole('button', { name: 'Enviar' }, SLOW);
  return { ...opened, session, card: view.current?.card };
}

describe('«Más» sobre un ejercicio de la sesión (objeciones 4 y 5)', () => {
  it('después de «Editar», el ejercicio muestra el texto nuevo', async () => {
    const { user, session } = await atFirstExercise();
    await user.click(within(session).getByRole('button', { name: 'Más' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }, SLOW));
    const dialog = await screen.findByRole('dialog', {}, SLOW);
    const question = within(dialog).getByRole('textbox', { name: 'Pregunta' });
    await user.clear(question);
    await user.type(question, 'Un enunciado corregido');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await user.click(await screen.findByRole('button', { name: 'No, solo la redacción' }, SLOW));
    await within(session).findByText('Un enunciado corregido', {}, SLOW);
  });

  it('después de «Enviar», «Más» no ofrece «Saltar»', async () => {
    const { user, session } = await atFirstExercise();
    const number = within(session).queryByRole('textbox', {
      name: 'Tu respuesta, con coma o con punto',
    });
    if (number) {
      await user.type(number, '1');
    } else {
      await user.click(within(session).getAllByRole('radio')[0] as HTMLElement);
    }
    await user.click(within(session).getByRole('button', { name: 'Enviar' }));
    await within(session).findByRole('button', { name: 'Siguiente' }, SLOW);
    await user.click(within(session).getByRole('button', { name: 'Más' }));
    const items = (await screen.findAllByRole('menuitem', {}, SLOW)).map(
      (item) => item.textContent,
    );
    expect(items).toContain('Editar');
    expect(items).not.toContain('Saltar');
  });
});

describe('el diagnóstico tras un fallo en la sesión (objeción 13)', () => {
  it('[CA-153] trae su botón: «Practicar la diferencia» sale de la sesión y abre la otra tarjeta', async () => {
    const clock = movableClock();
    const { user, api } = openWindow('real', clock);
    const subject = await api['subjects.create']({ name: 'Geografía', makeActive: true });
    const italy = await api['cards.create']({
      question: 'La capital de Italia',
      answer: 'Roma',
      subjectId: subject.id,
      activity: { type: 'short' },
    });
    await practiceShort(api, italy.id, 'Roma');
    clock.advance(30);
    await api['cards.create']({
      question: '¿Cuál es la capital de España?',
      answer: 'Madrid',
      subjectId: subject.id,
    });
    render(<App />);
    await startFromStudy(user);
    const session = await theSession();
    // La sesión empieza con la tarjeta nueva.
    await within(session).findByRole('button', { name: 'Mostrar respuesta' }, SLOW);
    await user.click(within(session).getByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(await within(session).findByRole('button', { name: 'La sabía' }, SLOW));
    await user.type(
      await within(session).findByRole('textbox', { name: 'Tu respuesta' }, SLOW),
      'Madrid',
    );
    await user.click(within(session).getByRole('button', { name: 'Enviar' }));
    await user.click(
      await within(session).findByRole('button', { name: 'Practicar la diferencia' }, SLOW),
    );
    await waitFor(
      () => expect(screen.queryByRole('main', { name: 'Sesión de estudio' })).toBeNull(),
      SLOW,
    );
    await screen.findByText('¿Cuál es la capital de España?', {}, SLOW);
  });
});
