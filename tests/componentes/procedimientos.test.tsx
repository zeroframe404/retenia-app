import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { introOf } from '../../src/renderer/practice/ProcedureView';
import { movableClock } from '../apoyo/procedimiento';
import { closeWindows, openWindow } from './apoyo-ventana';

// Fase 18, en la ventana.

afterEach(closeWindows);

const SLOW = { timeout: 10_000 };
const PROCEDURE = 'Calcular un intervalo de confianza para la media';

function withCast() {
  return openWindow('real', undefined, { withCast: 'tarjetas' });
}

type User = ReturnType<typeof openWindow>['user'];

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });

// Ctrl+K, escribir y «Practicar ahora».
async function practiceByName(user: User, name: string) {
  await user.keyboard('{Control>}k{/Control}');
  const dialog = await screen.findByRole('dialog', { name: 'Buscar' }, SLOW);
  await user.type(within(dialog).getByRole('combobox', { name: /Buscar/ }), name);
  // El resultado marcado es el primero: se espera a que sea el buscado.
  await waitFor(
    () => expect(within(dialog).getAllByRole('option')[0]?.textContent).toContain(name),
    SLOW,
  );
  await user.click(within(dialog).getByRole('button', { name: 'Practicar ahora' }));
}

async function backToCardsByRail(user: User) {
  await user.click(within(rail()).getByRole('button', { name: 'Ajustes' }));
  await screen.findByRole('heading', { level: 2, name: 'Ajustes' }, SLOW);
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await user.click(
    within(await screen.findByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole(
      'button',
      { name: 'Tarjetas' },
    ),
  );
}

describe('volver a «Tarjetas» después de «Practicar ahora»', () => {
  it('muestra la lista: la actividad no se vuelve a abrir sola', async () => {
    const { user } = withCast();
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await practiceByName(user, PROCEDURE);
    await screen.findByRole('heading', { name: 'Ejemplo resuelto' }, SLOW);
    await backToCardsByRail(user);
    await screen.findByText('180 tarjetas', {}, SLOW);
    expect(screen.queryByRole('heading', { name: 'Ejemplo resuelto' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'Ejercicio' })).toBeNull();
  });
});

const SET = 'Media, mediana y moda';

// Contesta el problema a la vista y pasa al siguiente.
async function answerProblem(user: User) {
  const field = await screen.findByRole(
    'textbox',
    { name: 'Tu respuesta, con coma o con punto' },
    SLOW,
  );
  await user.type(field, '1');
  await user.click(screen.getByRole('button', { name: 'Enviar' }));
  await user.click(await screen.findByRole('button', { name: 'Siguiente' }, SLOW));
}

describe('el conjunto retomado (objeción 1)', () => {
  it('[CA-162] salir a mitad, volver y terminar llega al cierre con el orden de los 9 tipos', async () => {
    const { user } = withCast();
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await practiceByName(user, SET);
    for (let item = 1; item <= 2; item += 1) {
      await screen.findByText(new RegExp(`Problema ${item} de 9`), {}, SLOW);
      await answerProblem(user);
    }
    await screen.findByText(/Problema 3 de 9/, {}, SLOW);
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    await practiceByName(user, SET);
    for (let item = 3; item <= 9; item += 1) {
      await screen.findByText(new RegExp(`Problema ${item} de 9`), {}, SLOW);
      await answerProblem(user);
    }
    await screen.findByRole('heading', { name: 'Conjunto terminado' }, SLOW);
    const order = screen.getByRole('list', { name: 'Los tipos, en el orden en que salieron' });
    expect(within(order).getAllByRole('listitem')).toHaveLength(9);
  });
});

describe('el cierre de un numérico con variantes (objeción 10)', () => {
  it('[CA-166] dos fallos en dos variantes: al tocar «Siguiente», el cierre propone el micro-ejercicio', async () => {
    const { user, api } = withCast();
    const { subjects } = await api['subjects.list']({});
    await api['cards.create']({
      question: 'El doble de un número',
      answer: 'x',
      subjectId: subjects.find((s) => s.name === 'Estadística básica')?.id ?? null,
      activity: {
        type: 'numeric',
        value: 0,
        tolerance: 0,
        unit: null,
        family: {
          statements: ['¿Cuál es el doble de {a}?'],
          parameters: [{ name: 'a', values: [2, 3, 4, 5, 6, 7, 8, 9] }],
          derived: [],
        },
        formula: 'a * 2',
      },
    });
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await practiceByName(user, 'El doble de un número');
    await answerProblem(user);
    await practiceByName(user, 'El doble de un número');
    await answerProblem(user);
    await screen.findByRole('heading', { name: 'Práctica terminada' }, SLOW);
    await screen.findByRole('button', { name: 'Hacer el micro-ejercicio' }, SLOW);
  });
});

describe('el texto de los pasos vacíos (objeción 16)', () => {
  const view = (blank: readonly boolean[], kind: 'blanks' | 'variant', statement = 'x') => ({
    statement,
    rung: { kind, blanks: kind === 'blanks' ? 1 : 0 },
    steps: blank.map((value) => ({ blank: value })),
  });

  it('dice cuántos pasos se completan según los que están vacíos, también cuando vuelve uno de antes', () => {
    expect(introOf(view([false, false, false, true], 'blanks'))).toBe(
      'Completá el último paso; los demás ya están resueltos.',
    );
    expect(introOf(view([false, false, true, true], 'blanks'))).toBe(
      'Completá los 2 últimos pasos; los demás ya están resueltos.',
    );
    expect(introOf(view([true, false, false, true], 'blanks'))).toBe(
      'Completá los pasos vacíos; los demás ya están resueltos.',
    );
    expect(introOf(view([true, true], 'variant', ''))).toBe(
      'Resolvé el problema entero, paso por paso.',
    );
  });
});

describe('«Discrepo» en el resultado de un procedimiento (objeción 9)', () => {
  it('[CA-139] [CA-141] ofrece los cuatro motivos; «Mi respuesta era correcta» lo pasa a «Correcto.» y «Deshacer» vuelve', async () => {
    const clock = movableClock();
    const { user, api } = openWindow('real', clock, { withCast: 'tarjetas' });
    const { cards } = await api['cards.list']({ kind: 'exercise' });
    const cardId = cards.find((card) => card.question === PROCEDURE)?.id ?? '';
    // El ejemplo en 2 días distintos: al tercero, el último paso viene vacío.
    for (let day = 1; day <= 2; day += 1) {
      const openingId = crypto.randomUUID();
      await api['activities.start']({ cardId, openingId });
      const view = await api['procedure.open']({ cardId, openingId });
      await api['procedure.studied']({
        cardId,
        openingId,
        why: view.steps
          .filter((step) => step.key)
          .map((step) => ({ stepId: step.id, text: 'Porque mide cuánto cambia la media.' })),
      });
      clock.advance(1);
    }
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await practiceByName(user, PROCEDURE);
    await user.type(
      await screen.findByRole('textbox', { name: 'Paso 4: tu resultado' }, SLOW),
      '999998',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Hay un error en el paso 4; ¿lo encontrás?', {}, SLOW);
    await user.click(screen.getByRole('button', { name: 'Ver la corrección' }));
    await user.click(await screen.findByRole('button', { name: 'Ver el resultado' }, SLOW));
    await screen.findByText('Todavía no.', {}, SLOW);

    await user.click(screen.getByRole('button', { name: 'Discrepo' }));
    const reasons = (await screen.findAllByRole('menuitem', {}, SLOW)).map(
      (item) => item.textContent,
    );
    expect(reasons).toEqual([
      'Mi respuesta era correcta',
      'La pregunta era ambigua',
      'La referencia está incompleta',
      'La referencia es incorrecta',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Mi respuesta era correcta' }));
    await screen.findByText('Todavía no → Correcto', {}, SLOW);
    await screen.findByText('Correcto.', {}, SLOW);

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await screen.findByText('Todavía no.', {}, SLOW);
    expect(screen.queryByText('Todavía no → Correcto')).toBeNull();
  });
});
