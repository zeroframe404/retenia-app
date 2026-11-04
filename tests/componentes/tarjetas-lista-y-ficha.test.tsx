import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../src/data/ids';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { pngBytes } from '../apoyo/espacio';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La pestaña «Tarjetas» de la Fase 08 contra el puente real: la lista con su contador y sus filtros,
// el detalle con el camino de contexto, la ficha, «¿Cambió lo que hay que recordar?», la inversa y
// la pausa.

const bridges: TestBridge[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

function setup() {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  const { workspace } = bridge;
  const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const media = workspace.topics.create({ subjectId: subject.id, name: 'Media y dispersión' });
  const intervals = workspace.topics.create({
    subjectId: subject.id,
    name: 'Intervalos de confianza',
  });
  const user = userEvent.setup();
  const onOpenNote = vi.fn();
  const open = () => render(<CardsScreen subject={subject} onOpenNote={onOpenNote} />);
  const add = (question: string, topicId: string | null = null, answer = 'R') =>
    workspace.cards.create({ question, answer, subjectId: subject.id, topicId });
  return { bridge, workspace, subject, media, intervals, user, open, add, onOpenNote };
}

const openCard = async (user: ReturnType<typeof userEvent.setup>, question: string) => {
  await user.click(await screen.findByRole('button', { name: `Abrir la tarjeta «${question}»` }));
  await screen.findByRole('heading', { name: 'Tarjeta' });
};

describe('[CA-056] la lista con su contador y sus filtros', () => {
  it('[CA-056] sin filtro el contador dice cuántas tarjetas hay en la materia', async () => {
    const { add, open } = setup();
    for (let n = 0; n < 12; n++) {
      add(`Tarjeta ${n}`);
    }
    open();
    expect(await screen.findByText('12 tarjetas')).toBeTruthy();
  });

  it('[CA-056] con 1 sola tarjeta el contador dice «1 tarjeta»', async () => {
    const { add, open } = setup();
    add('Única');
    open();
    expect(await screen.findByText('1 tarjeta')).toBeTruthy();
  });

  it('[CA-056] filtrar por el tema «Intervalos de confianza» deja solo esas, cada una con su próximo repaso', async () => {
    const { add, open, media, intervals, user, workspace, subject } = setup();
    add('Media 1', media.id);
    add('Media 2', media.id);
    const a = add('Intervalo 1', intervals.id);
    add('Intervalo 2', intervals.id);
    workspace.cards.review({ cardId: a.id, grade: 'good', attemptId: newId() });
    open();
    expect(await screen.findByText('4 tarjetas')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Tema'), intervals.id);
    expect(await screen.findByText('2 de 4 tarjetas')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Tus tarjetas' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Intervalo 2'),
      expect.stringContaining('Intervalo 1'),
    ]);
    expect(rows[1]?.textContent).toContain('Próximo repaso: miércoles 17/03/2027');
    expect(rows[0]?.textContent).toContain('Todavía sin repasar');
    expect(workspace.cards.list({ subjectId: subject.id })).toHaveLength(4);
  });

  it('[CA-056] filtra por estado y por tipo, y avisa si ninguna cumple', async () => {
    const { add, open, user, workspace } = setup();
    const verified = add('Verificada');
    add('Otra');
    workspace.cards.edit({
      cardId: verified.id,
      question: 'Verificada',
      answer: 'R',
      sheet: { state: 'verified' },
    });
    open();
    expect(await screen.findByText('2 tarjetas')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Estado'), 'verified');
    expect(await screen.findByText('1 de 2 tarjetas')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Tipo'), 'cloze');
    expect(await screen.findByText('Ninguna tarjeta cumple esos filtros.')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Tipo'), '');
    await user.selectOptions(screen.getByLabelText('Estado'), '');
    expect(await screen.findByText('2 tarjetas')).toBeTruthy();
  });

  it('[CA-056] cada materia ve solo sus tarjetas', async () => {
    const { add, open, workspace } = setup();
    add('De estadística');
    const history = workspace.subjects.create({ name: 'Historia argentina' });
    workspace.cards.create({ question: 'De historia', answer: 'R', subjectId: history.id });
    open();
    expect(await screen.findByText('1 tarjeta')).toBeTruthy();
    expect(screen.queryByText('De historia')).toBeNull();
  });

  it('soporta miles de filas sin armar miles de elementos', async () => {
    const { workspace, subject, media, open } = setup();
    // Las 3.000 entran juntas, en una sola transacción: una por una, la máquina del CI (unas diez
    // veces más lenta) pasaba el minuto solo armando los datos.
    workspace.cards.plantCast(
      Array.from({ length: 3000 }, (_, n) => ({
        question: `Tarjeta ${n}`,
        answer: 'R',
        kind: 'qa' as const,
        subjectId: subject.id,
        topicId: media.id,
        createdAt: new Date('2027-01-01T13:00:00Z'),
        reviews: [],
      })),
    );
    open();
    expect(await screen.findByText('3.000 tarjetas')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Tus tarjetas' })).getAllByRole(
      'listitem',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(40);
    expect(rows[0]?.getAttribute('aria-setsize')).toBe('3000');
  }, 60_000);

  it('sin ninguna tarjeta muestra el estado vacío con la invitación a crear la primera', async () => {
    const { open } = setup();
    open();
    expect(await screen.findByText(/Todavía no tenés tarjetas/)).toBeTruthy();
    expect(screen.queryByText(/tarjetas$/)).toBeNull();
  });
});

describe('«Nueva tarjeta» suelta, sin nota', () => {
  it('queda en la materia que mirás, con el tema que elijas', async () => {
    const { open, user, intervals, workspace, subject } = setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), '¿Qué es un percentil?');
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), 'Un valor de posición');
    await user.selectOptions(screen.getByLabelText('Tema'), intervals.id);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Tarjeta guardada')).toBeTruthy();
    const created = workspace.cards.list({ subjectId: subject.id })[0];
    expect(created).toMatchObject({ question: '¿Qué es un percentil?', topicId: intervals.id });
    expect(workspace.cards.get({ cardId: created?.id ?? '' }).path.canOpenNote).toBe(false);
  });
});

describe('[CA-051] el camino de contexto y «Ver en la nota»', () => {
  function withNoteCard() {
    const ctx = setup();
    const regression = ctx.workspace.topics.create({
      subjectId: ctx.subject.id,
      name: 'Regresión',
    });
    const note = ctx.workspace.notes.create({ subjectId: ctx.subject.id, topicId: regression.id });
    const first = note.blocks[0]?.id ?? '';
    ctx.workspace.notes.save({
      noteId: note.id,
      title: 'Regresión lineal',
      blocks: [
        {
          id: first,
          parentId: null,
          collapsed: false,
          content: [{ type: 'text', text: 'Pendiente >> Cuánto cambia y por cada unidad de x' }],
        },
      ],
    });
    return { ...ctx, note, first };
  }

  it('[CA-051] muestra «Estadística básica › Regresión › Regresión lineal»', async () => {
    const { open, user } = withNoteCard();
    open();
    await openCard(user, 'Pendiente');
    const nav = screen.getByRole('navigation', { name: 'Camino de la tarjeta' });
    expect(nav.textContent).toBe('Estadística básica › Regresión › Regresión lineal');
  });

  it('[CA-051] «Ver en la nota» lleva a la nota y al renglón de la tarjeta', async () => {
    const { open, user, onOpenNote, note, first } = withNoteCard();
    open();
    await openCard(user, 'Pendiente');
    await user.click(screen.getByRole('button', { name: 'Ver en la nota' }));
    expect(onOpenNote).toHaveBeenCalledWith(note.id, first);
  });

  it('una tarjeta suelta no tiene «Ver en la nota»', async () => {
    const { open, user, add } = setup();
    add('Suelta');
    open();
    await openCard(user, 'Suelta');
    expect(screen.queryByRole('button', { name: 'Ver en la nota' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Camino de la tarjeta' }).textContent).toBe(
      'Estadística básica',
    );
  });
});

describe('[CA-053] «Editar ficha»', () => {
  it('[CA-053] carga una variante y una pista, guarda, y al volver a abrir siguen ahí con el estado «Revisada»', async () => {
    const { open, user, add } = setup();
    add('Pendiente', null, 'Cuánto cambia y por cada unidad de x');
    open();
    await openCard(user, 'Pendiente');
    expect(screen.getByText('Estado: Revisada')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Variantes aceptables (una por renglón)' }),
      'inclinación de la recta',
    );
    await user.type(screen.getByRole('textbox', { name: 'Pista 1' }), 'Empieza con P');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeTruthy();
    expect(screen.getByText('Variantes aceptables: inclinación de la recta')).toBeTruthy();
    expect(screen.getByText('Pista 1: Empieza con P')).toBeTruthy();
    expect(screen.getByText('Estado: Revisada')).toBeTruthy();
    // Volver a abrir desde la lista.
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    await openCard(user, 'Pendiente');
    expect(screen.getByText('Pista 1: Empieza con P')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    expect((screen.getByRole('textbox', { name: 'Pista 1' }) as HTMLInputElement).value).toBe(
      'Empieza con P',
    );
  });

  it('[CA-053] ofrece las tres pistas y los cuatro componentes esenciales, ni uno más', async () => {
    const { open, user, add } = setup();
    add('P');
    open();
    await openCard(user, 'P');
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    expect(screen.getAllByRole('textbox', { name: /^Pista \d$/ })).toHaveLength(3);
    expect(screen.getAllByRole('textbox', { name: /^Componente esencial \d$/ })).toHaveLength(4);
  });

  it('[CA-053] el estado se elige entre «Revisada», «Verificada», «En revisión» y «Retirada»', async () => {
    const { open, user, add, workspace } = setup();
    const card = add('P');
    open();
    await openCard(user, 'P');
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    const select = screen.getByLabelText('Estado de la ficha');
    expect([...within(select).getAllByRole('option')].map((option) => option.textContent)).toEqual([
      'Revisada',
      'Verificada',
      'En revisión',
      'Retirada',
    ]);
    await user.selectOptions(select, 'verified');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Estado: Verificada')).toBeTruthy();
    expect(workspace.cards.get({ cardId: card.id }).sheet.state).toBe('verified');
  });
});

describe('[CA-054] «¿Cambió lo que hay que recordar?» al guardar', () => {
  function withHistory() {
    const ctx = setup();
    const card = ctx.add('¿Qué es la media muestral?', null, 'El promedio de los datos');
    ctx.workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: newId() });
    return { ...ctx, card };
  }

  async function editAnswer(
    user: ReturnType<typeof userEvent.setup>,
    text: string,
    replace = false,
  ) {
    await openCard(user, '¿Qué es la media muestral?');
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    const field = screen.getByRole('textbox', { name: 'Respuesta' });
    if (replace) {
      await user.clear(field);
    }
    await user.type(field, text);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
  }

  it('[CA-054] pregunta con las dos opciones y no guarda hasta que elegís', async () => {
    const { open, user, card, workspace } = withHistory();
    open();
    await editAnswer(user, '.');
    const dialog = await screen.findByRole('dialog', { name: '¿Cambió lo que hay que recordar?' });
    expect(within(dialog).getByRole('button', { name: 'No, solo la redacción' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Sí' })).toBeTruthy();
    expect(workspace.cards.get({ cardId: card.id }).answer).toBe('El promedio de los datos');
  });

  it('[CA-054] «No, solo la redacción» conserva el próximo repaso', async () => {
    const { open, user, card, workspace } = withHistory();
    const before = workspace.cards.get({ cardId: card.id }).nextReviewDay;
    open();
    await editAnswer(user, '.');
    await user.click(await screen.findByRole('button', { name: 'No, solo la redacción' }));
    expect(await screen.findByText('Cambios guardados')).toBeTruthy();
    expect(await screen.findByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy();
    expect(workspace.cards.get({ cardId: card.id }).nextReviewDay).toBe(before);
    expect(workspace.cards.get({ cardId: card.id }).answer).toBe('El promedio de los datos.');
  });

  it('[CA-054] «Sí» la programa como nueva y el historial anterior sigue a la vista', async () => {
    const { open, user, card, workspace } = withHistory();
    open();
    await editAnswer(user, 'Otra respuesta distinta', true);
    await user.click(await screen.findByRole('button', { name: 'Sí' }));
    expect(await screen.findByText('Cambios guardados')).toBeTruthy();
    expect(screen.getByText('Todavía sin repasar')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Historial' }));
    const rows = within(
      await screen.findByRole('list', { name: 'Repasos de la tarjeta' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '15/03/2027 · La sabía',
      '15/03/2027 · Cambió lo que hay que recordar: volvió a programarse como nueva',
    ]);
    expect(workspace.cards.get({ cardId: card.id }).nextReviewDay).toBeNull();
  });

  it('cerrar la pregunta no guarda nada', async () => {
    const { open, user, card, workspace } = withHistory();
    open();
    await editAnswer(user, '.');
    await screen.findByRole('dialog', { name: '¿Cambió lo que hay que recordar?' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(workspace.cards.get({ cardId: card.id }).answer).toBe('El promedio de los datos');
  });

  it('una tarjeta sin historial se guarda sin preguntar', async () => {
    const { open, user, add } = setup();
    add('Sin repasos', null, 'R');
    open();
    await openCard(user, 'Sin repasos');
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), ' cambiada');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('una tarjeta que nació en una nota se edita en la nota: la ficha no deja tocar su texto', async () => {
    const { workspace, subject, open, user, bridge } = setup();
    const note = workspace.notes.create({ subjectId: subject.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'N',
      blocks: [
        {
          id: note.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'text', text: 'Pendiente >> Cuánto cambia' }],
        },
      ],
    });
    open();
    await openCard(user, 'Pendiente');
    await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    expect(
      (screen.getByRole('textbox', { name: 'Respuesta' }) as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect(screen.getByText('El texto de esta tarjeta se edita en su nota.')).toBeTruthy();
    expect(bridge.sent.filter((message) => message.channel === 'cards.edit')).toEqual([]);
  });
});

describe('[CA-055] «Crear inversa»', () => {
  it('[CA-055] «Pendiente» da una tarjeta que pregunta «Cuánto cambia y por cada unidad de x» y responde «Pendiente»', async () => {
    const { open, user, add, workspace, subject } = setup();
    add('Pendiente', null, 'Cuánto cambia y por cada unidad de x');
    open();
    await openCard(user, 'Pendiente');
    await user.click(screen.getByRole('button', { name: 'Crear inversa' }));
    expect(await screen.findByText('Creé la tarjeta inversa.')).toBeTruthy();
    const inverse = workspace.cards
      .list({ subjectId: subject.id })
      .find((card) => card.question === 'Cuánto cambia y por cada unidad de x');
    expect(inverse?.answer).toBe('Pendiente');
    expect(screen.queryByRole('button', { name: 'Crear inversa' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    expect(await screen.findByText('2 tarjetas')).toBeTruthy();
  });
});

describe('[CA-057] «Pausar esta tarjeta» y «Reanudar»', () => {
  it('[CA-057] pausada dice «En pausa» en vez del próximo repaso, y al reanudar vuelve su fecha', async () => {
    const { open, user, add, workspace } = setup();
    const card = add('Pausable');
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: newId() });
    open();
    await openCard(user, 'Pausable');
    expect(screen.getByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Pausar esta tarjeta' }));
    expect(await screen.findByText('En pausa')).toBeTruthy();
    expect(screen.queryByText('Próximo repaso: miércoles 17/03/2027')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    const row = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    expect(row.textContent).toContain('En pausa');
    expect(row.textContent).not.toContain('Próximo repaso');
    await user.click(within(row).getByRole('button', { name: /^Abrir la tarjeta/ }));
    await user.click(await screen.findByRole('button', { name: 'Reanudar' }));
    await waitFor(() =>
      expect(screen.getByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Pausar esta tarjeta' })).toBeTruthy();
    expect(workspace.cards.history({ cardId: card.id }).entries).toHaveLength(1);
  });
});

describe('[CA-057] una tarjeta pausada no se ofrece para repasar', () => {
  it('[CA-057] «Repasar» no está ni en su fila ni en su pantalla mientras está en pausa, y vuelve al reanudar', async () => {
    const { open, user, add } = setup();
    add('Pausable');
    open();
    await openCard(user, 'Pausable');
    expect(screen.getByRole('button', { name: 'Repasar' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Pausar esta tarjeta' }));
    await screen.findByText('En pausa');
    expect(screen.queryByRole('button', { name: 'Repasar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    await screen.findByText('1 tarjeta');
    expect(screen.queryByRole('button', { name: 'Repasar' })).toBeNull();
    await openCard(user, 'Pausable');
    await user.click(screen.getByRole('button', { name: 'Reanudar' }));
    expect(await screen.findByRole('button', { name: 'Repasar' })).toBeTruthy();
  });
});

describe('[CA-056] al pasar a otra materia no quedan los filtros de la anterior', () => {
  it('el filtro de tema de una materia no se arrastra a la otra', async () => {
    const { workspace, media, open, user, add } = setup();
    add('De estadística', media.id);
    const other = workspace.subjects.create({ name: 'Historia argentina' });
    workspace.cards.create({ question: 'De historia', answer: 'R', subjectId: other.id });
    const view = open();
    expect(await screen.findByText('1 tarjeta')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Tema'), media.id);
    await screen.findByText('1 tarjeta');
    view.rerender(<CardsScreen subject={other} />);
    expect(await screen.findByText('De historia')).toBeTruthy();
    expect((screen.getByLabelText('Tema') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByText('Ninguna tarjeta cumple esos filtros.')).toBeNull();
  });
});

describe('[CA-377] y [CA-378] imagen y fórmula de la tarjeta en el repaso', () => {
  async function cardWithImageAndFormula() {
    const ctx = setup();
    const { sha } = ctx.workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    const note = ctx.workspace.notes.create({ subjectId: ctx.subject.id, topicId: null });
    ctx.workspace.notes.save({
      noteId: note.id,
      title: 'Campana',
      blocks: [
        {
          id: note.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [
            { type: 'image', sha, width: 1, height: 1, alt: 'La campana' },
            { type: 'text', text: ' Media >> $\\frac{\\sum x}{n}$' },
          ],
        },
      ],
    });
    return ctx;
  }

  it('[CA-377] la imagen se ve en la pregunta (el lado del renglón en que estaba), no en la respuesta', async () => {
    const { open, user } = await cardWithImageAndFormula();
    open();
    await user.click(await screen.findByRole('button', { name: 'Repasar' }));
    expect(await screen.findByRole('img', { name: 'La campana' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    expect(screen.getAllByRole('img', { name: 'La campana' })).toHaveLength(1);
  });

  it('[CA-378] la fórmula de la respuesta se ve como en un libro al mostrar la respuesta', async () => {
    const { open, user } = await cardWithImageAndFormula();
    open();
    await user.click(await screen.findByRole('button', { name: 'Repasar' }));
    await screen.findByRole('img', { name: 'La campana' });
    expect(document.querySelector('[data-formula="rendered"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-formula="rendered"] .katex')).toHaveLength(1),
    );
  });

  it('[CA-378] la fórmula de la pregunta también se dibuja', async () => {
    const { open, user, workspace, subject } = setup();
    workspace.cards.create({
      question: 'La media es $\\bar{x}$',
      answer: 'La suma sobre n',
      subjectId: subject.id,
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'Repasar' }));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-formula="rendered"] .katex')).toHaveLength(1),
    );
  });
});
