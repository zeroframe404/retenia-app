import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow } from './apoyo-ventana';

// Fase 17, en la ventana: Progreso › «Objetivos» con «Nuevo objetivo» y el panel de evidencias,
// «Ya lo sé», los requisitos en Estudiar, «Mejorar la tarjeta», «Mis errores» y la línea del
// diagnóstico tras un fallo.

afterEach(closeWindows);

const SLOW = { timeout: 10_000 };
const OPEN_QUESTION =
  'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?';
const INTERPRET = 'Interpretar un intervalo de confianza';
const CALCULATE = 'Calcular la media y el desvío';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function withCast() {
  return openWindow('real', undefined, { withCast: 'tarjetas' });
}

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const sections = () => screen.getByRole('navigation', { name: 'Secciones de Progreso' });

async function toProgress(user: ReturnType<typeof openWindow>['user']) {
  await screen.findByRole('button', { name: 'Empezar' }, SLOW);
  await user.click(within(rail()).getByRole('button', { name: 'Progreso' }));
  await screen.findByRole('heading', { level: 2, name: 'Progreso' });
}

async function statisticsId(api: ReturnType<typeof openWindow>['api']) {
  const { subjects } = await api['subjects.list']({});
  return subjects.find((s) => s.name === 'Estadística básica')?.id ?? '';
}

async function createInterpret(api: ReturnType<typeof openWindow>['api']) {
  const subjectId = await statisticsId(api);
  const { topics } = await api['topics.list']({ subjectId });
  const { cards } = await api['cards.list']({ subjectId });
  const objectiveId = randomUUID();
  await api['objectives.create']({
    objectiveId,
    subjectId,
    topicId: topics.find((t) => t.name === 'Intervalos de confianza')?.id ?? null,
    text: INTERPRET,
    conditions: null,
    kind: 'understand',
    cardIds: [cards.find((c) => c.question === OPEN_QUESTION)?.id ?? ''],
  });
  return objectiveId;
}

describe('Progreso › «Objetivos»', () => {
  it('[CA-143] Progreso abre en «Objetivos»; «Nuevo objetivo» con tema, texto, tipo y el ejercicio abierto lo deja en la lista «Sin iniciar»', async () => {
    const { user } = withCast();
    render(<App />);
    await toProgress(user);
    expect(
      within(sections()).getByRole('button', { name: 'Objetivos' }).getAttribute('aria-current'),
    ).toBe('page');
    await screen.findByRole('heading', { name: 'Objetivos de Estadística básica' }, SLOW);
    await user.click(screen.getByRole('button', { name: 'Nuevo objetivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo objetivo' });
    await user.selectOptions(within(dialog).getByLabelText('Tema'), 'Intervalos de confianza');
    await user.type(within(dialog).getByLabelText('Texto'), INTERPRET);
    await user.click(within(dialog).getByRole('radio', { name: 'Comprender' }));
    await user.click(
      await within(dialog).findByRole(
        'checkbox',
        { name: new RegExp(`^${escapeRegExp(OPEN_QUESTION)}`, 'u') },
        SLOW,
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Crear objetivo' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nuevo objetivo' })).toBeNull(),
    );
    const topic = await screen.findByRole(
      'region',
      { name: 'Objetivos de Intervalos de confianza' },
      SLOW,
    );
    const row = await within(topic).findByRole('button', { name: INTERPRET }, SLOW);
    const item = row.closest('li') as HTMLElement;
    expect(within(item).getByText('Sin iniciar')).toBeTruthy();
    expect(within(item).getByText('Comprender')).toBeTruthy();
    // El implícito del tema va primero.
    expect(within(topic).getAllByRole('button')[0]?.textContent).toBe(
      'Recordar: Intervalos de confianza',
    );
  });

  it('[CA-149] el panel de un objetivo: estado, qué falta, cuatro columnas con conteo y fecha y la estimación con su respaldo, nunca un porcentaje', async () => {
    const { user, api } = withCast();
    await createInterpret(api);
    render(<App />);
    await toProgress(user);
    await user.click(await screen.findByRole('button', { name: INTERPRET }, SLOW));
    const panel = await screen.findByRole('dialog', { name: INTERPRET });
    expect(await within(panel).findByText('Sin iniciar', {}, SLOW)).toBeTruthy();
    expect(
      within(panel).getByText('Qué falta: un intento en cualquiera de sus actividades.'),
    ).toBeTruthy();
    const evidence = within(panel).getByRole('region', { name: 'Evidencias' });
    for (const name of ['Sin ayuda', 'Con ayuda', 'Diferido', 'Variantes']) {
      expect(within(evidence).getByText(name)).toBeTruthy();
    }
    expect(within(evidence).getAllByText('0')).toHaveLength(4);
    expect(within(evidence).getAllByText('Ninguna todavía')).toHaveLength(4);
    expect(
      within(panel).getByText(
        'Lo que estima Retenia de «intervalo de confianza»: todavía sin observaciones.',
      ),
    ).toBeTruthy();
    // Nunca un porcentaje como dominio.
    expect(within(panel).getByText(/^Lo que estima Retenia/u).textContent ?? '').not.toMatch(/%/u);
    expect(
      within(panel).getByRole('button', { name: `Practicar ahora: ${OPEN_QUESTION}` }),
    ).toBeTruthy();
  });

  it('[CA-150] «Ya lo sé» deja «Suficiente para avanzar (por verificar)» y la comprobación pendiente desde mañana', async () => {
    const { user, api } = withCast();
    await createInterpret(api);
    render(<App />);
    await toProgress(user);
    await user.click(await screen.findByRole('button', { name: INTERPRET }, SLOW));
    const panel = await screen.findByRole('dialog', { name: INTERPRET });
    await user.click(await within(panel).findByRole('button', { name: 'Ya lo sé' }, SLOW));
    expect(
      await within(panel).findByText('Suficiente para avanzar (por verificar)', {}, SLOW),
    ).toBeTruthy();
    expect(within(panel).getByText('Comprobación pendiente desde el 16/03/2027.')).toBeTruthy();
    // El mismo día todavía no se puede hacer: un acierto de hoy no la confirmaría.
    expect(within(panel).queryByRole('button', { name: 'Hacer la comprobación' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Ya lo sé' })).toBeNull();
  });

  it('[CA-150] al día siguiente, Estudiar propone la comprobación de «Ya lo sé» con su motivo y el panel ofrece «Hacer la comprobación»', async () => {
    let offset = 0;
    const { user, api } = openWindow(
      'real',
      { now: () => demoClock(offset).now() },
      { withCast: 'tarjetas' },
    );
    const interpret = await createInterpret(api);
    await api['objectives.knowAlready']({ objectiveId: interpret });
    offset = 1;
    render(<App />);
    const proposal = await screen.findByRole('region', { name: /^Sesión recomendada/ }, SLOW);
    const note = await within(proposal).findByRole(
      'note',
      { name: 'Comprobación pendiente' },
      SLOW,
    );
    expect([...note.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
      'Comprobación pendiente: Interpretar un intervalo de confianza',
      'Por qué: marcaste «Ya lo sé»; un acierto sin ayuda lo confirma.',
    ]);
    await user.click(within(note).getByRole('button', { name: 'Hacer la comprobación' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Ejercicio' }, SLOW)).toBeTruthy();
    await toProgress(user);
    await user.click(await screen.findByRole('button', { name: INTERPRET }, SLOW));
    const panel = await screen.findByRole('dialog', { name: INTERPRET });
    expect(
      await within(panel).findByRole('button', { name: 'Hacer la comprobación' }, SLOW),
    ).toBeTruthy();
  });

  it('[CA-151] «Marcar como requisito de…» desde «Calcular la media y el desvío» y, en el requisito, «Esto no es necesario para aquello»', async () => {
    const { user, api } = withCast();
    await createInterpret(api);
    render(<App />);
    await toProgress(user);
    await user.click(await screen.findByRole('button', { name: CALCULATE }, SLOW));
    const panel = await screen.findByRole('dialog', { name: CALCULATE });
    await user.click(
      await within(panel).findByRole('button', { name: 'Marcar como requisito de…' }, SLOW),
    );
    await user.selectOptions(within(panel).getByLabelText('Objetivo'), INTERPRET);
    await user.click(within(panel).getByRole('radio', { name: 'Indispensable' }));
    await user.click(within(panel).getByRole('button', { name: 'Guardar' }));
    const neededBy = await within(panel).findByRole('region', { name: 'Es requisito de' }, SLOW);
    expect(await within(neededBy).findByText(INTERPRET, {}, SLOW)).toBeTruthy();
    expect(within(neededBy).getByText('Indispensable')).toBeTruthy();
    expect(within(neededBy).getByText('Confirmado')).toBeTruthy();
    await user.click(
      within(neededBy).getByRole('button', { name: 'Esto no es necesario para aquello' }),
    );
    expect(
      await within(panel).findByText('Listo: ese requisito ya no frena.', {}, SLOW),
    ).toBeTruthy();
    expect(within(panel).getByText('No es requisito de ningún objetivo.')).toBeTruthy();
  });
});

describe('Estudiar con un requisito', () => {
  it('[CA-151] [CA-152] la propuesta empieza por «Antes conviene: Calcular la media y el desvío» con su motivo; «Esto no es necesario para aquello» la saca al instante', async () => {
    const { user, api } = withCast();
    const interpret = await createInterpret(api);
    const subjectId = await statisticsId(api);
    const list = await api['objectives.list']({ subjectId });
    const calculate =
      list.topics.flatMap((t) => t.objectives).find((o) => o.title === CALCULATE)?.id ?? '';
    await api['objectives.requirements.add']({
      requirementId: randomUUID(),
      objectiveId: interpret,
      requiresId: calculate,
      kind: 'indispensable',
      status: 'confirmed',
    });
    render(<App />);
    const proposal = await screen.findByRole('region', { name: /^Sesión recomendada/ }, SLOW);
    const note = await within(proposal).findByRole('note', { name: 'Requisito' }, SLOW);
    const lines = [...note.querySelectorAll('p')].map((line) => line.textContent);
    expect(lines).toEqual([
      'Antes conviene: Calcular la media y el desvío',
      'Por qué: «Interpretar un intervalo de confianza» necesita «Calcular la media y el desvío», que todavía está en «Sin iniciar».',
    ]);
    // Va antes que lo demás de la propuesta.
    expect(proposal.querySelector('p')?.textContent).toBe(
      'Antes conviene: Calcular la media y el desvío',
    );
    expect(within(note).getByRole('button', { name: 'Practicar ahora' })).toBeTruthy();
    await user.click(
      within(note).getByRole('button', { name: 'Esto no es necesario para aquello' }),
    );
    await waitFor(
      () => expect(within(proposal).queryByRole('note', { name: 'Requisito' })).toBeNull(),
      SLOW,
    );
    expect(proposal.textContent).not.toContain(CALCULATE);
  });
});

describe('Progreso › «Mejorar la tarjeta» y «Mis errores»', () => {
  it('[CA-154] «Mejorar la tarjeta» muestra la del 95 % con «Reformular», «Dividir en dos», «Agregar una pista» y «Ver en el original»', async () => {
    const { user } = withCast();
    render(<App />);
    await toProgress(user);
    await user.click(within(sections()).getByRole('button', { name: 'Mejorar la tarjeta' }));
    const list = await screen.findByRole('list', { name: 'Mejorar la tarjeta' }, SLOW);
    const item = within(list)
      .getByText('¿Qué significa el 95 % en un intervalo de confianza del 95 %?')
      .closest('li') as HTMLElement;
    expect(within(item).getByText('4 fallos')).toBeTruthy();
    for (const name of [
      'Reformular',
      'Dividir en dos',
      'Agregar una pista',
      'Ver en el original',
    ]) {
      expect(within(item).getByRole('button', { name })).toBeTruthy();
    }
    // «Dividir en dos» pide las dos tarjetas.
    await user.click(within(item).getByRole('button', { name: 'Dividir en dos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dividir en dos' });
    expect(within(dialog).getAllByLabelText('Pregunta')).toHaveLength(2);
    expect(
      (within(dialog).getByRole('button', { name: 'Crear las dos' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('[CA-154] «Mejorar la tarjeta» pide solo las tarjetas de la materia que está a la vista', async () => {
    const opened = withCast();
    const { user, api } = opened;
    const subjectId = await statisticsId(api);
    render(<App />);
    await toProgress(user);
    await user.click(within(sections()).getByRole('button', { name: 'Mejorar la tarjeta' }));
    await screen.findByRole('list', { name: 'Mejorar la tarjeta' }, SLOW);
    const asked = opened.bridge.sent.filter(
      (message) => message.channel === 'progress.improveCard.list',
    );
    expect(asked.length).toBeGreaterThan(0);
    for (const message of asked) {
      expect(message.request).toEqual({ subjectId });
    }
  });

  it('[CA-154] «Agregar una pista» abre la ficha en Apuntes y, al guardar, la tarjeta deja la lista', async () => {
    const { user } = withCast();
    render(<App />);
    await toProgress(user);
    await user.click(within(sections()).getByRole('button', { name: 'Mejorar la tarjeta' }));
    const list = await screen.findByRole('list', { name: 'Mejorar la tarjeta' }, SLOW);
    await user.click(within(list).getByRole('button', { name: 'Agregar una pista' }));
    await screen.findByRole('heading', { level: 3, name: 'Editar ficha' }, SLOW);
    await user.type(screen.getByLabelText('Pista 1'), 'Pensá en muchas muestras.');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('heading', { level: 3, name: 'Tarjeta' }, SLOW);
    await user.click(within(rail()).getByRole('button', { name: 'Progreso' }));
    await user.click(within(sections()).getByRole('button', { name: 'Mejorar la tarjeta' }));
    expect(await screen.findByText('Ninguna tarjeta necesita mejoras.', {}, SLOW)).toBeTruthy();
  });

  it('[CA-155] «Mis errores» muestra lo que escribiste tal cual, la correcta y un tipo de error que se puede cambiar, por tema', async () => {
    const { user, api } = withCast();
    const subjectId = await statisticsId(api);
    const { cards } = await api['cards.list']({ subjectId });
    const capital = cards.find((c) => c.question === 'Capital de Francia')?.id ?? '';
    const openingId = randomUUID();
    await api['activities.start']({ cardId: capital, openingId });
    const sent = await api['activities.submit']({
      cardId: capital,
      openingId,
      attemptId: randomUUID(),
      attemptNo: 1,
      answer: { type: 'short', text: 'asdf' },
      help: [],
      noIdea: false,
    });
    await api['activities.finalize']({ attemptId: sent.attemptId, verdict: 'incorrect' });
    render(<App />);
    await toProgress(user);
    await user.click(within(sections()).getByRole('button', { name: 'Mis errores' }));
    const group = await screen.findByRole('region', { name: 'Errores de Sin tema' }, SLOW);
    expect(within(group).getByText('Capital de Francia')).toBeTruthy();
    expect(within(group).getByText('Tu respuesta: asdf')).toBeTruthy();
    expect(within(group).getByText('La correcta: París')).toBeTruthy();
    const type = within(group).getByLabelText('Tipo de error') as HTMLSelectElement;
    expect(type.selectedOptions[0]?.textContent).toBe('No lo recordaba');
    await user.selectOptions(type, 'Distracción');
    expect(await screen.findByText('Tipo de error guardado.', {}, SLOW)).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          within(screen.getByRole('region', { name: 'Errores de Sin tema' })).getByLabelText(
            'Tipo de error',
          ) as HTMLSelectElement
        ).selectedOptions[0]?.textContent,
      ).toBe('Distracción'),
    );
  });
});

describe('el resultado tras un fallo', () => {
  it('[CA-153] con una duda guardada, «Mandar a revisión» deja la tarjeta «En revisión» y ese fallo no cuenta: no queda en «Mis errores»', async () => {
    const { user, api } = withCast();
    const subjectId = await statisticsId(api);
    const { cards } = await api['cards.list']({ subjectId });
    const capital = cards.find((c) => c.question === 'Capital de Francia')?.id ?? '';
    await api['doubts.create']({
      doubtId: randomUUID(),
      text: '¿Con tilde?',
      cardId: capital,
      sessionId: null,
    });
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Tarjetas',
      }),
    );
    await user.selectOptions(await screen.findByLabelText('Tipo', {}, SLOW), 'Ejercicio');
    await user.click(
      await screen.findByRole('button', { name: 'Abrir la tarjeta «Capital de Francia»' }, SLOW),
    );
    await user.click(await screen.findByRole('button', { name: 'Practicar ahora' }, SLOW));
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'asdf');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const result = await waitFor(() => {
      const found = document.querySelector('[data-component="result"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, SLOW);
    expect([...result.querySelectorAll('p')].map((line) => line.textContent)[2]).toBe(
      'Mandala a revisión: marcaste esta pregunta como dudosa.',
    );
    await user.click(within(result).getByRole('button', { name: 'Mandar a revisión' }));
    await waitFor(
      () => expect(within(result).queryByRole('button', { name: 'Mandar a revisión' })).toBeNull(),
      SLOW,
    );
    expect((await api['cards.get']({ cardId: capital })).sheet.state).toBe('in_review');
    const errors = await api['progress.errors']({ subjectId });
    expect(
      errors.groups.flatMap((group) => group.items).filter((item) => item.cardId === capital),
    ).toEqual([]);
  });

  it('[CA-153] la tercera línea dice una sola acción con su motivo: con un requisito sin cumplir, «Andá al requisito…» e «Ir al requisito» lleva a su panel', async () => {
    const { user, api } = withCast();
    const subjectId = await statisticsId(api);
    const { cards } = await api['cards.list']({ subjectId });
    const capital = cards.find((c) => c.question === 'Capital de Francia')?.id ?? '';
    const geography = randomUUID();
    await api['objectives.create']({
      objectiveId: geography,
      subjectId,
      topicId: null,
      text: 'Nombrar capitales',
      conditions: null,
      kind: 'remember',
      cardIds: [capital],
    });
    const list = await api['objectives.list']({ subjectId });
    const calculate =
      list.topics.flatMap((t) => t.objectives).find((o) => o.title === CALCULATE)?.id ?? '';
    await api['objectives.requirements.add']({
      requirementId: randomUUID(),
      objectiveId: geography,
      requiresId: calculate,
      kind: 'indispensable',
      status: 'confirmed',
    });
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Tarjetas',
      }),
    );
    // Los ejercicios van al final de la lista: se filtran para que estén a la vista.
    await user.selectOptions(await screen.findByLabelText('Tipo', {}, SLOW), 'Ejercicio');
    await user.click(
      await screen.findByRole('button', { name: 'Abrir la tarjeta «Capital de Francia»' }, SLOW),
    );
    await user.click(await screen.findByRole('button', { name: 'Practicar ahora' }, SLOW));
    await user.type(await screen.findByPlaceholderText('Tu respuesta…', {}, SLOW), 'asdf');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const result = await waitFor(() => {
      const found = document.querySelector('[data-component="result"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, SLOW);
    const lines = [...result.querySelectorAll('p')].map((line) => line.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Todavía no.');
    expect(lines[2]).toBe(
      'Andá al requisito «Calcular la media y el desvío»: todavía está en «Sin iniciar».',
    );
    await user.click(within(result).getByRole('button', { name: 'Ir al requisito' }));
    expect(await screen.findByRole('dialog', { name: CALCULATE }, SLOW)).toBeTruthy();
  });
});
