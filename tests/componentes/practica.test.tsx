import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../src/core/evaluation';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { ReviewView } from '../../src/renderer/cards/ReviewView';
import { ExerciseView } from '../../src/renderer/practice/ExerciseView';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La pantalla de una actividad de la Fase 16 contra el puente real: la barra de ayuda, la escalera
// de pistas, el panel que no borra lo escrito, el resultado en tres líneas, bajar sí y subir no,
// «Discrepo» y el aviso de evaluación corregida.

const SLOW = { timeout: 5000 };
const bridges: TestBridge[] = [];
afterEach(() => {
  cleanup();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

const HINTS = [
  '¿El 95 % habla de este intervalo o del método?',
  'Un intervalo sale de un procedimiento que se repite.',
  'Imaginá 100 muestras.',
];

const OPEN: Activity = {
  type: 'open',
  units: [
    { id: 'u1', text: 'Habla del procedimiento.' },
    { id: 'u2', text: 'Cerca del 95 % de los intervalos contendría la media.' },
    { id: 'u3', text: 'No es la probabilidad de este intervalo.' },
  ],
};

function setup(
  activity: Activity,
  {
    question = 'Un intervalo del 95 %',
    answer = 'Tres ideas',
    mode = 'practice',
  }: { question?: string; answer?: string; mode?: 'practice' | 'evaluation' } = {},
) {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  const card = bridge.workspace.cards.create({
    question,
    answer,
    activity,
    mode,
    sheet: { hints: HINTS, explanation: 'Así se explica.', source: 'Apunte de clase, página 6' },
    example: 'Un ejemplo resuelto.',
  });
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onEditReference = vi.fn();
  const view = render(
    <ExerciseView cardId={card.id} onClose={onClose} onEditReference={onEditReference} />,
  );
  return { bridge, card, user, onClose, onEditReference, view };
}

const result = (container: HTMLElement) => {
  const found = container.querySelector<HTMLElement>('[data-component="result"]');
  if (!found) {
    throw new Error('no hay resultado');
  }
  return found;
};

const button = (name: string) => screen.getByRole('button', { name });

async function send(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button('Enviar'));
}

describe('la barra de ayuda', () => {
  it('[CA-135] recién abierta, «Pista» está apagada; se prende al escribir algo', async () => {
    const { user } = setup(OPEN);
    const hint = await screen.findByRole('button', { name: 'Pista' }, SLOW);
    expect((hint as HTMLButtonElement).disabled).toBe(true);
    expect((button('Ver un ejemplo') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Fuente') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Preguntar al tutor' })).toBeNull();
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'El');
    await waitFor(() => expect((button('Pista') as HTMLButtonElement).disabled).toBe(false));
    expect((button('Ver un ejemplo') as HTMLButtonElement).disabled).toBe(false);
    expect((button('Fuente') as HTMLButtonElement).disabled).toBe(false);
  });

  it('[CA-135] también se prende con «No sé por dónde empezar»', async () => {
    const { user } = setup(OPEN);
    await user.click(await screen.findByRole('button', { name: 'No sé por dónde empezar' }, SLOW));
    await waitFor(() => expect((button('Pista') as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('button', { name: 'No sé por dónde empezar' })).toBeNull();
  });

  it('[CA-136] las pistas llegan en orden y antes de la solución pregunta si querés intentarlo una vez más', async () => {
    const { user } = setup(OPEN);
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'El');
    for (const [index, hint] of HINTS.entries()) {
      await user.click(button('Pista'));
      const panel = await screen.findByRole('complementary', { name: 'Pistas' }, SLOW);
      await within(panel).findByText(hint, {}, SLOW);
      expect(within(panel).getAllByRole('listitem')).toHaveLength(index + 1);
    }
    const panel = screen.getByRole('complementary', { name: 'Pistas' });
    expect(within(panel).getByText('Pregunta orientadora')).toBeTruthy();
    expect(within(panel).getByText('Pista de concepto')).toBeTruthy();
    expect(within(panel).getByText('Pista de paso')).toBeTruthy();
    await user.click(button('Pista'));
    const dialog = await screen.findByRole('dialog', {}, SLOW);
    expect(
      within(dialog).getByText(
        'La próxima pista muestra la respuesta completa. ¿Querés intentarlo una vez más?',
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Intentarlo una vez más' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(button('Pista'));
    await user.click(
      within(await screen.findByRole('dialog', {}, SLOW)).getByRole('button', {
        name: 'Ver la solución',
      }),
    );
    const solution = await screen.findByRole('complementary', { name: 'Solución' }, SLOW);
    expect(within(solution).getByText('Habla del procedimiento.')).toBeTruthy();
  });

  it('[CA-138] abrir «Pista», «Ver un ejemplo» y «Fuente» y volver deja el texto completo', async () => {
    const { user } = setup(OPEN);
    const field = await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW);
    const written = 'Habla del método, no de este intervalo; con muchas muestras acierta.';
    await user.type(field, written);
    for (const [name, title] of [
      ['Pista', 'Pistas'],
      ['Ver un ejemplo', 'Ejemplo'],
      ['Fuente', 'Fuente'],
    ] as const) {
      await user.click(button(name));
      const panel = await screen.findByRole('complementary', { name: title }, SLOW);
      expect((screen.getByPlaceholderText('Tu respuesta…') as HTMLTextAreaElement).value).toBe(
        written,
      );
      await user.click(within(panel).getByRole('button', { name: 'Cerrar el panel' }));
      expect((screen.getByPlaceholderText('Tu respuesta…') as HTMLTextAreaElement).value).toBe(
        written,
      );
    }
  });

  it('[CA-137] con la primera ayuda el rótulo pasa a «PRÁCTICA CON AYUDA»; un acierto con pista de concepto dice «Logrado con pista de concepto»', async () => {
    const { user, view } = setup(OPEN);
    expect(await screen.findByText('PRÁCTICA AUTÓNOMA', {}, SLOW)).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'El método');
    await user.click(button('Pista'));
    expect(await screen.findByText('PRÁCTICA CON AYUDA', {}, SLOW)).toBeTruthy();
    await user.click(button('Pista'));
    await screen.findByText(HINTS[1] ?? '', {}, SLOW);
    await send(user);
    for (const index of [1, 2, 3]) {
      await user.click(
        await screen.findByRole('checkbox', { name: `La cubrí: idea ${index}` }, SLOW),
      );
    }
    await waitFor(() =>
      expect(
        within(result(view.container)).getByText('Logrado con pista de concepto'),
      ).toBeTruthy(),
    );
    expect(within(result(view.container)).queryByText('Correcto.')).toBeNull();
    expect(screen.getByText('PRÁCTICA CON AYUDA')).toBeTruthy();
  });
});

describe('la respuesta abierta', () => {
  it('[CA-129] después de «Enviar», la respuesta modelo en 3 unidades con casillas; con 2 marcadas, «Vas bien.»', async () => {
    const { user, view } = setup(OPEN);
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Algo');
    await send(user);
    const boxes = await screen.findAllByRole('checkbox', {}, SLOW);
    expect(boxes).toHaveLength(3);
    expect(within(result(view.container)).getByText('Todavía no.')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'La cubrí: idea 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'La cubrí: idea 2' }));
    await waitFor(() => expect(within(result(view.container)).getByText('Vas bien.')).toBeTruthy());
  });

  it('[CA-130] el resultado se puede bajar y no subir', async () => {
    const { user, view } = setup(OPEN);
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Algo');
    await send(user);
    await user.click(await screen.findByRole('checkbox', { name: 'La cubrí: idea 1' }, SLOW));
    await user.click(screen.getByRole('checkbox', { name: 'La cubrí: idea 2' }));
    await waitFor(() => expect(within(result(view.container)).getByText('Vas bien.')).toBeTruthy());
    const group = screen.getByRole('group', { name: 'Cambiar resultado' });
    const higher = within(group).getByRole('radio', { name: 'Correcto.' }) as HTMLInputElement;
    expect(higher.disabled).toBe(true);
    await user.click(higher);
    expect(within(result(view.container)).getByText('Vas bien.')).toBeTruthy();
    await user.click(within(group).getByRole('radio', { name: 'Todavía no.' }));
    await waitFor(() =>
      expect(within(result(view.container)).getByText('Todavía no.')).toBeTruthy(),
    );
  });
});

describe('los tipos con regla', () => {
  it('[CA-131] «Paría» es «Todavía no.» con la diferencia letra por letra; «paris», «Correcto.»', async () => {
    const wrong = setup({ type: 'short' }, { question: 'Capital de Francia', answer: 'París' });
    await wrong.user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Paría');
    await send(wrong.user);
    await waitFor(() =>
      expect(within(result(wrong.view.container)).getByText('Todavía no.')).toBeTruthy(),
    );
    const diff = screen.getByRole('region', { name: 'Diferencia letra por letra' });
    expect(diff.querySelectorAll('[data-letter="changed"]')).toHaveLength(2);
    expect(within(diff).getByText('«a» en lugar de «s»')).toBeTruthy();
    cleanup();
    const right = setup({ type: 'short' }, { question: 'Capital de Francia', answer: 'París' });
    await right.user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'paris');
    await send(right.user);
    await waitFor(() =>
      expect(within(result(right.view.container)).getByText('Correcto.')).toBeTruthy(),
    );
  });

  it('[CA-132] numérica: «5,0» es correcta y «5.3» no', async () => {
    const numeric: Activity = { type: 'numeric', value: 5, tolerance: 0.05, unit: null };
    for (const [raw, verdict] of [
      ['5,0', 'Correcto.'],
      ['5.3', 'Todavía no.'],
    ] as const) {
      const { user, view } = setup(numeric, { question: 'La media de 2, 4 y 9', answer: '5' });
      await user.type(
        await screen.findByLabelText('Tu respuesta, con coma o con punto', {}, SLOW),
        raw,
      );
      await send(user);
      await waitFor(() => expect(within(result(view.container)).getByText(verdict)).toBeTruthy());
      cleanup();
    }
  });

  it('[CA-133] tres opciones; al elegir la equivocada, su explicación', async () => {
    const { user, view } = setup(
      {
        type: 'options',
        options: [
          { id: 'a', text: 'La mediana', correct: true, explanation: '' },
          {
            id: 'b',
            text: 'La media',
            correct: false,
            explanation: 'Un valor extremo la arrastra.',
          },
          {
            id: 'c',
            text: 'El punto medio',
            correct: false,
            explanation: 'Depende de los extremos.',
          },
        ],
      },
      { question: '¿Qué medida cambia menos?', answer: 'La mediana' },
    );
    const group = await screen.findByRole('group', { name: 'Elegí una opción' }, SLOW);
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    await user.click(within(group).getByRole('radio', { name: 'La media' }));
    await send(user);
    await waitFor(() =>
      expect(
        within(result(view.container)).getByText('Un valor extremo la arrastra.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('La correcta: La mediana')).toBeTruthy();
  });

  it('ordenar pasos: se mueven con «Subir» y «Bajar» y el resultado marca cada paso', async () => {
    const { user, view } = setup(
      {
        type: 'order',
        steps: [
          { id: 's1', text: 'Ordenar' },
          { id: 's2', text: 'Contar' },
          { id: 's3', text: 'Ubicar' },
        ],
        acceptedOrders: [],
      },
      { question: 'Ordená los pasos', answer: 'Ordenar · Contar · Ubicar' },
    );
    const list = await screen.findByRole('region', { name: 'Ordená los pasos' }, SLOW);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await user.click(within(list).getAllByRole('button', { name: /^Bajar/ })[0] as HTMLElement);
    await send(user);
    await waitFor(() => expect(result(view.container)).toBeTruthy());
    expect(view.container.querySelectorAll('[data-step]')).toHaveLength(3);
  });
});

describe('el resultado', () => {
  it('[CA-134] siempre en tres líneas: veredicto, qué revisar y una sola acción, con «Siguiente», «Explicación», «Reintentar» y «Discrepo»', async () => {
    const { user, view } = setup(
      { type: 'short' },
      { question: 'Capital de Francia', answer: 'París' },
    );
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Roma');
    await send(user);
    const shown = await waitFor(() => result(view.container));
    const lines = [...shown.querySelectorAll('p')].map((line) => line.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Todavía no.');
    expect(lines[1]).toContain('Revisá las letras marcadas');
    expect(lines[2]).toBe('Mirá la explicación.');
    expect(shown.textContent).not.toMatch(/\b\d{1,3} ?\/ ?100\b|\bnota\b/i);
    for (const name of ['Siguiente', 'Explicación', 'Reintentar', 'Discrepo']) {
      expect(button(name)).toBeTruthy();
    }
  });

  it('[CA-139] «Discrepo» ofrece los cuatro motivos', async () => {
    const { user } = setup({ type: 'short' }, { question: 'Capital de Francia', answer: 'París' });
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Roma');
    await send(user);
    await user.click(await screen.findByRole('button', { name: 'Discrepo' }, SLOW));
    const menu = await screen.findByRole('menu', {}, SLOW);
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Mi respuesta era correcta',
      'La pregunta era ambigua',
      'La referencia está incompleta',
      'La referencia es incorrecta',
    ]);
  });

  it('[CA-141] «Mi respuesta era correcta» pasa a «Correcto.» con el aviso «Todavía no → Correcto», «Entendido» y «Deshacer»; «Deshacer» vuelve a «Todavía no.»', async () => {
    const { user, view } = setup(
      { type: 'short' },
      { question: 'Capital de Francia', answer: 'París' },
    );
    await user.type(
      await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW),
      'Ciudad de París',
    );
    await send(user);
    await user.click(await screen.findByRole('button', { name: 'Discrepo' }, SLOW));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Mi respuesta era correcta' }, SLOW),
    );
    expect(await screen.findByText('Todavía no → Correcto', {}, SLOW)).toBeTruthy();
    expect(within(result(view.container)).getByText('Correcto.')).toBeTruthy();
    const notice = view.container.querySelector<HTMLElement>(
      '[data-component="corrected-evaluation"]',
    );
    if (!notice) {
      throw new Error('no hay aviso');
    }
    expect(
      within(notice).getByText(/^Próximo repaso: martes 16\/03\/2027 → miércoles 17\/03\/2027$/),
    ).toBeTruthy();
    expect(within(notice).getByRole('button', { name: 'Entendido' })).toBeTruthy();
    await user.click(within(notice).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() =>
      expect(within(result(view.container)).getByText('Todavía no.')).toBeTruthy(),
    );
    expect(screen.queryByText('Todavía no → Correcto')).toBeNull();
  });

  it('«La referencia está incompleta» abre la edición de la referencia', async () => {
    const { user, onEditReference } = setup(OPEN);
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'Otra idea');
    await send(user);
    await user.click(await screen.findByRole('button', { name: 'Discrepo' }, SLOW));
    await user.click(
      await screen.findByRole('menuitem', { name: 'La referencia está incompleta' }, SLOW),
    );
    await waitFor(() => expect(onEditReference).toHaveBeenCalledWith('units'));
  });
});

describe('el modo «EVALUACIÓN»', () => {
  it('avisa al empezar y no muestra ninguna ayuda hasta enviar', async () => {
    const { user } = setup(OPEN, { mode: 'evaluation' });
    expect(
      await screen.findByText(
        'Esta actividad es una evaluación: las ayudas aparecen después de enviar.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
    expect(screen.getByText('EVALUACIÓN')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pista' })).toBeNull();
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'Algo');
    expect(screen.queryByRole('button', { name: 'Pista' })).toBeNull();
    await send(user);
    expect(await screen.findByRole('button', { name: 'Explicación' }, SLOW)).toBeTruthy();
  });
});

describe('«Practicar ahora» en una tarjeta de siempre', () => {
  it('[CA-135] la tarjeta también trae la barra: «Pista» apagada hasta escribir, y el rótulo cambia con la primera ayuda', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    window.retenia = bridge.api as unknown as typeof window.retenia;
    const card = bridge.workspace.cards.create({
      question: '¿Qué es la media?',
      answer: 'El promedio',
    });
    bridge.workspace.cards.edit({
      cardId: card.id,
      question: '¿Qué es la media?',
      answer: 'El promedio',
      sheet: { hints: ['¿Qué hacés con todos los datos?'] },
    });
    const user = userEvent.setup();
    render(<ReviewView card={card} onReviewed={vi.fn()} onClose={vi.fn()} />);
    const hint = await screen.findByRole('button', { name: 'Pista' }, SLOW);
    expect((hint as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'La suma');
    await waitFor(() => expect((button('Pista') as HTMLButtonElement).disabled).toBe(false));
    await user.click(button('Pista'));
    expect(await screen.findByText('PRÁCTICA CON AYUDA', {}, SLOW)).toBeTruthy();
    expect((screen.getByPlaceholderText('Tu respuesta…') as HTMLTextAreaElement).value).toBe(
      'La suma',
    );
  });
});

describe('la lista de «Tarjetas» con ejercicios', () => {
  it('[CA-056] los ejercicios se listan con la marca «Ejercicio», no suman al contador y el filtro «Ejercicio» los deja solos', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    window.retenia = bridge.api as unknown as typeof window.retenia;
    const subject = bridge.workspace.subjects.create({
      name: 'Estadística básica',
      makeActive: true,
    });
    for (const question of ['Una', 'Otra']) {
      bridge.workspace.cards.create({ question, answer: 'R', subjectId: subject.id });
    }
    bridge.workspace.cards.create({
      question: 'Capital de Francia',
      answer: 'París',
      subjectId: subject.id,
      activity: { type: 'short' },
    });
    const user = userEvent.setup();
    render(<CardsScreen subject={subject} />);
    expect(await screen.findByText('2 tarjetas', {}, SLOW)).toBeTruthy();
    const row = screen
      .getByRole('button', { name: 'Abrir la tarjeta «Capital de Francia»' })
      .closest('li');
    expect(row?.textContent).toContain('Ejercicio');
    expect(within(row as HTMLElement).queryByRole('checkbox')).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'exercise');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('0 de 2 tarjetas')).toBeTruthy();
  });
});
