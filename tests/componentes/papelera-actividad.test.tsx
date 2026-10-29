import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { ActivityScreen } from '../../src/renderer/activity/ActivityScreen';
import { TrashScreen } from '../../src/renderer/trash/TrashScreen';
import { openBridge, type TestBridge } from '../apoyo/puente';

// «Papelera» y «Actividad reciente» contra el puente real.

const bridges: TestBridge[] = [];
function open() {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  return { bridge, user: userEvent.setup() };
}
afterEach(() => {
  cleanup();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

describe('pantalla «Papelera»', () => {
  it('vacía, lo dice', async () => {
    open();
    render(<TrashScreen />);
    expect(await screen.findByRole('heading', { name: 'Papelera' })).toBeTruthy();
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vaciar papelera' })).toBeNull();
  });

  it('[CA-022] muestra la tarjeta eliminada con la fecha en que se elimina para siempre, y «Restaurar» la devuelve', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: '¿Qué es la varianza?', answer: 'R' });
    bridge.workspace.cards.remove({ cardId: card.id });
    render(<TrashScreen />);
    const list = await screen.findByRole('list', { name: 'Tarjetas en la papelera' });
    const [row] = within(list).getAllByRole('listitem');
    expect(row?.textContent).toContain('¿Qué es la varianza?');
    expect(row?.textContent).toContain('Se elimina para siempre el 14/04/2027');
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText('La tarjeta volvió a la lista.')).toBeTruthy();
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
    expect(bridge.workspace.cards.list().map((item) => item.question)).toEqual([
      '¿Qué es la varianza?',
    ]);
  });

  it('«Vaciar papelera» pide confirmación: «Cancelar» no borra nada y «Vaciar» la vacía', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: 'Se va para siempre', answer: 'R' });
    bridge.workspace.cards.remove({ cardId: card.id });
    render(<TrashScreen />);
    await user.click(await screen.findByRole('button', { name: 'Vaciar papelera' }));
    expect(screen.getByText('Las tarjetas de la papelera se eliminan para siempre.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Las tarjetas de la papelera se eliminan para siempre.')).toBeNull();
    expect(bridge.workspace.trash.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Vaciar papelera' }));
    await user.click(screen.getByRole('button', { name: 'Vaciar' }));
    expect(await screen.findByText('Vaciaste la papelera.')).toBeTruthy();
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
    expect(bridge.workspace.trash.list()).toEqual([]);
  });

  it('si algo falla, avisa sin jerga y no pierde nada', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    bridge.workspace.cards.remove({ cardId: card.id });
    bridge.handlers['trash.restore'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<TrashScreen />);
    const list = await screen.findByRole('list', { name: 'Tarjetas en la papelera' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText('No pude completar esto. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect(bridge.workspace.trash.list()).toHaveLength(1);
  });
});

describe('pantalla «Actividad reciente»', () => {
  it('sin cambios, lo dice', async () => {
    open();
    render(<ActivityScreen />);
    expect(await screen.findByRole('heading', { name: 'Actividad reciente' })).toBeTruthy();
    expect(await screen.findByText('Todavía no hiciste cambios.')).toBeTruthy();
  });

  it('[CA-023] muestra la edición con fecha y hora, y «Deshacer» en ese renglón devuelve la pregunta anterior', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: '¿Qué es la varianza?', answer: 'R' });
    bridge.workspace.cards.edit({
      cardId: card.id,
      question: '¿Qué es la varianza? PRUEBA',
      answer: 'R',
    });
    render(<ActivityScreen />);
    const list = await screen.findByRole('list', { name: 'Tus cambios' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('15/03/2027 10:00 · Editaste «¿Qué es la varianza? PRUEBA»'),
      expect.stringContaining('15/03/2027 10:00 · Creaste «¿Qué es la varianza?»'),
    ]);
    await user.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Listo: deshiciste el cambio.')).toBeTruthy();
    expect(bridge.workspace.cards.list()[0]?.question).toBe('¿Qué es la varianza?');
    const after = within(await screen.findByRole('list', { name: 'Tus cambios' })).getAllByRole(
      'listitem',
    );
    expect(after[0]?.textContent).toContain('Deshiciste la edición de «¿Qué es la varianza?»');
    // La edición ya deshecha no ofrece «Deshacer» otra vez.
    expect(within(after[1] as HTMLElement).queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('un cambio que se volvió imposible de deshacer avisa y no cambia nada', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: 'A', answer: 'R' });
    bridge.workspace.cards.edit({ cardId: card.id, question: 'B', answer: 'R' });
    render(<ActivityScreen />);
    const list = await screen.findByRole('list', { name: 'Tus cambios' });
    // Mientras la pantalla está abierta, la tarjeta cambia por otro lado.
    bridge.workspace.cards.edit({ cardId: card.id, question: 'C', answer: 'R' });
    await user.click(within(list).getAllByRole('button', { name: 'Deshacer' })[0] as HTMLElement);
    expect(await screen.findByText('Ese cambio ya no se puede deshacer.')).toBeTruthy();
    expect(bridge.workspace.cards.list()[0]?.question).toBe('C');
  });
});

// Lo que llegó en la Fase 07: la Papelera junta tarjetas, notas, temas y elementos de la Bandeja, y
// la Actividad reciente cuenta también lo que se hace con las materias, los temas y las notas.
function openAtDay() {
  let offset = 0;
  const bridge = openBridge({ clock: { now: () => demoClock(offset).now() } });
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  return {
    bridge,
    user: userEvent.setup(),
    nextDay: () => {
      offset += 1;
    },
  };
}

async function seedOrganization(api: TestBridge['api']) {
  const subject = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
  const topic = await api['topics.create']({ subjectId: subject.id, name: 'Media y dispersión' });
  const note = await api['notes.create']({ subjectId: subject.id, topicId: topic.id });
  await api['notes.save']({ noteId: note.id, title: 'Media y desvío', blocks: note.blocks });
  return { subject, topic, note };
}

describe('pantalla «Papelera» con notas, temas y Bandeja', () => {
  it('junta las tarjetas y lo demás en una sola lista, lo más nuevo primero, con el tipo de cada cosa', async () => {
    const { bridge, nextDay } = openAtDay();
    const { api } = bridge;
    const { topic, note } = await seedOrganization(api);
    const card = await api['cards.create']({ question: '¿Qué es la varianza?', answer: 'R' });
    await api['cards.delete']({ cardId: card.id });
    nextDay();
    await api['notes.delete']({ noteId: note.id });
    nextDay();
    await api['topics.delete']({ topicId: topic.id });
    nextDay();
    await api['inbox.capture']({ text: 'Revisar el capítulo 4' });
    const { items } = await api['inbox.list']({});
    await api['inbox.delete']({ itemId: items[0]?.id ?? '' });

    render(<TrashScreen />);
    const list = await screen.findByRole('list', { name: 'Tarjetas en la papelera' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Revisar el capítulo 4',
      'Media y dispersión',
      'Media y desvío',
      '¿Qué es la varianza?',
    ]);
    expect(rows[0]?.textContent).toContain('Bandeja');
    expect(rows[1]?.textContent).toContain('Tema');
    expect(rows[2]?.textContent).toContain('Nota');
    expect(rows[3]?.textContent).toContain('Se elimina para siempre el 14/04/2027');
    expect(rows[0]?.textContent).toMatch(/Se elimina para siempre el \d\d\/\d\d\/\d{4}/);
  });

  it('«Restaurar» una nota la devuelve a su lugar y dice «Volvió a su lugar.»', async () => {
    const { bridge, user } = openAtDay();
    const { subject, note } = await seedOrganization(bridge.api);
    await bridge.api['notes.delete']({ noteId: note.id });
    render(<TrashScreen />);
    const list = await screen.findByRole('list', { name: 'Tarjetas en la papelera' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText('Volvió a su lugar.')).toBeTruthy();
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
    const { notes } = await bridge.api['notes.list']({ subjectId: subject.id });
    expect(notes.map((item) => item.title)).toEqual(['Media y desvío']);
  });

  it('una nota sin título se llama «Sin título» en la lista', async () => {
    const { bridge } = openAtDay();
    const subject = await bridge.api['subjects.create']({
      name: 'Estadística básica',
      makeActive: true,
    });
    const note = await bridge.api['notes.create']({ subjectId: subject.id, topicId: null });
    await bridge.api['notes.delete']({ noteId: note.id });
    render(<TrashScreen />);
    const list = await screen.findByRole('list', { name: 'Tarjetas en la papelera' });
    expect(within(list).getByText('Sin título')).toBeTruthy();
  });

  it('«Vaciar papelera» elimina para siempre también lo que no es tarjeta', async () => {
    const { bridge, user } = openAtDay();
    const { note } = await seedOrganization(bridge.api);
    await bridge.api['notes.delete']({ noteId: note.id });
    render(<TrashScreen />);
    await user.click(await screen.findByRole('button', { name: 'Vaciar papelera' }));
    await user.click(screen.getByRole('button', { name: 'Vaciar' }));
    expect(await screen.findByText('Vaciaste la papelera.')).toBeTruthy();
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
    expect((await bridge.api['trash.listOrganization']({})).items).toEqual([]);
  });

  it('si no se puede leer lo nuevo, avisa y «Reintentar» lo vuelve a pedir', async () => {
    const { bridge, user } = openAtDay();
    const original = bridge.handlers['trash.listOrganization'];
    bridge.handlers['trash.listOrganization'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<TrashScreen />);
    expect(await screen.findByText('No pude cargar la papelera. Probá de nuevo.')).toBeTruthy();
    bridge.handlers['trash.listOrganization'] = original;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy();
  });
});

describe('pantalla «Actividad reciente» con materias, temas, notas y Bandeja', () => {
  it('cuenta cada cambio con su cosa: «Archivaste la nota «…»», «Moviste…», «Renombraste el tema…», «Activaste la materia…» y «Eliminaste «…» de la Bandeja»', async () => {
    const { bridge } = openAtDay();
    const { api } = bridge;
    const { topic, note } = await seedOrganization(api);
    await api['notes.move']({ noteId: note.id, topicId: null });
    await api['notes.archive']({ noteId: note.id });
    await api['topics.rename']({ topicId: topic.id, name: 'Medidas de resumen' });
    const other = await api['subjects.create']({ name: 'Historia argentina', makeActive: false });
    await api['subjects.activate']({ subjectId: other.id });
    await api['inbox.capture']({ text: 'Revisar el capítulo 4' });
    const { items } = await api['inbox.list']({});
    await api['inbox.delete']({ itemId: items[0]?.id ?? '' });

    render(<ActivityScreen />);
    const list = await screen.findByRole('list', { name: 'Tus cambios' });
    const texts = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    const has = (what: string) =>
      expect(
        texts.some((text) => text.includes(`15/03/2027 10:00 · ${what}`)),
        what,
      ).toBe(true);
    has('Eliminaste «Revisar el capítulo 4» de la Bandeja');
    has('Activaste la materia «Historia argentina»');
    has('Renombraste el tema «Medidas de resumen»');
    has('Moviste la nota «Media y desvío»');
    has('Archivaste la nota «Media y desvío»');
    has('Creaste la nota «Media y desvío»');
    has('Creaste el tema «Medidas de resumen»');
  });

  it('«Deshacer» en una nota archivada la devuelve y el renglón nuevo cuenta que lo deshiciste', async () => {
    const { bridge, user } = openAtDay();
    const { subject, note } = await seedOrganization(bridge.api);
    await bridge.api['notes.archive']({ noteId: note.id });
    render(<ActivityScreen />);
    const list = await screen.findByRole('list', { name: 'Tus cambios' });
    const archived = within(list)
      .getAllByRole('listitem')
      .find((row) =>
        row.textContent?.includes('Archivaste la nota «Media y desvío»'),
      ) as HTMLElement;
    await user.click(within(archived).getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Listo: deshiciste el cambio.')).toBeTruthy();
    const { notes } = await bridge.api['notes.list']({ subjectId: subject.id });
    expect(notes[0]?.archived).toBe(false);
    const after = within(await screen.findByRole('list', { name: 'Tus cambios' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(after[0]).toContain('Deshiciste el archivado de la nota «Media y desvío»');
    expect(after.filter((text) => text.includes('Archivaste la nota'))).toHaveLength(1);
  });

  it('una nota sin título se llama «Sin título» y lo que se eliminó para siempre dice que ya no existe', async () => {
    const { bridge } = openAtDay();
    const subject = await bridge.api['subjects.create']({
      name: 'Estadística básica',
      makeActive: true,
    });
    await bridge.api['notes.create']({ subjectId: subject.id, topicId: null });
    const gone = await seedNote(bridge.api, subject.id, 'Va a desaparecer');
    await bridge.api['notes.delete']({ noteId: gone.id });
    await bridge.api['trash.empty']({});

    render(<ActivityScreen />);
    const list = await screen.findByRole('list', { name: 'Tus cambios' });
    const texts = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(texts.some((text) => text.includes('Creaste la nota «Sin título»'))).toBe(true);
    expect(
      texts.some((text) => text.includes('Eliminaste para siempre una nota de la papelera')),
    ).toBe(true);
    expect(texts.some((text) => text.includes('una nota que ya no existe'))).toBe(true);
  });
});

async function seedNote(api: TestBridge['api'], subjectId: string, title: string) {
  const note = await api['notes.create']({ subjectId, topicId: null });
  await api['notes.save']({ noteId: note.id, title, blocks: note.blocks });
  return note;
}
