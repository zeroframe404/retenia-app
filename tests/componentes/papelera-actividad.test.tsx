import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
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
