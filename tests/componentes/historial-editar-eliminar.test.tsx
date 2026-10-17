import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La pantalla «Tarjetas» con lo nuevo de la Fase 04: «Historial», «Editar» y «Eliminar», contra
// el puente real (manejadores del principal y una carpeta de datos real).

const bridges: TestBridge[] = [];
function openScreen() {
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

const itemWith = async (text: string) =>
  (await screen.findAllByRole('listitem')).find((item) => item.textContent?.includes(text)) as
    | HTMLElement
    | undefined;

describe('«Historial» de una tarjeta', () => {
  it('[CA-015] muestra un renglón por repaso con la fecha y el resultado, en el orden en que se hicieron', async () => {
    // Un reloj que se puede correr una semana, como «+7 días».
    let offset = 0;
    const bridge = openBridge({ clock: { now: () => demoClock(offset).now() } });
    bridges.push(bridge);
    window.retenia = bridge.api as unknown as typeof window.retenia;
    const user = userEvent.setup();
    const card = bridge.workspace.cards.create({
      question: '¿Qué mide el desvío estándar?',
      answer: 'R',
    });
    bridge.workspace.cards.review({
      cardId: card.id,
      grade: 'good',
      attemptId: crypto.randomUUID(),
    });
    offset = 7;
    bridge.workspace.cards.review({
      cardId: card.id,
      grade: 'hard',
      attemptId: crypto.randomUUID(),
    });
    render(<CardsScreen />);
    const item = await itemWith('¿Qué mide el desvío estándar?');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeTruthy();
    expect(screen.getByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    const rows = within(
      await screen.findByRole('list', { name: 'Repasos de la tarjeta' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '15/03/2027 · La sabía',
      '22/03/2027 · Con dudas',
    ]);
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    expect(await screen.findByRole('heading', { name: 'Tarjetas' })).toBeTruthy();
  });

  it('una tarjeta sin repasos dice «Todavía no la repasaste.»', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'Sin repasos', answer: 'R' });
    render(<CardsScreen />);
    const item = await itemWith('Sin repasos');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Historial' }));
    expect(await screen.findByText('Todavía no la repasaste.')).toBeTruthy();
  });

  it('si no puede leer el historial, avisa sin jerga', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    bridge.handlers['cards.history'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<CardsScreen />);
    const item = await itemWith('P');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Historial' }));
    expect(await screen.findByText('No pude cargar el historial. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
  });
});

describe('«Editar» una tarjeta', () => {
  it('[CA-023] el formulario viene con la pregunta y la respuesta, y al guardar la lista muestra la nueva', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: '¿Qué es la varianza?', answer: 'El cuadrado' });
    render(<CardsScreen />);
    const item = await itemWith('¿Qué es la varianza?');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Editar' }));
    expect(await screen.findByRole('heading', { name: 'Editar tarjeta' })).toBeTruthy();
    const question = screen.getByRole('textbox', { name: 'Pregunta' });
    expect((question as HTMLTextAreaElement).value).toBe('¿Qué es la varianza?');
    expect((screen.getByRole('textbox', { name: 'Respuesta' }) as HTMLTextAreaElement).value).toBe(
      'El cuadrado',
    );
    await user.type(question, ' PRUEBA');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeTruthy();
    expect(await itemWith('¿Qué es la varianza? PRUEBA')).toBeTruthy();
    expect(bridge.workspace.cards.list()[0]?.question).toBe('¿Qué es la varianza? PRUEBA');
  });

  it('sin pregunta no guarda: marca el campo y conserva la respuesta', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    render(<CardsScreen />);
    const item = await itemWith('P');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Editar' }));
    await user.clear(await screen.findByRole('textbox', { name: 'Pregunta' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribí la pregunta')).toBeTruthy();
    expect(bridge.workspace.cards.list()[0]?.question).toBe('P');
    expect(bridge.sent.filter((message) => message.channel === 'cards.edit')).toEqual([]);
  });

  it('«Cancelar» vuelve a la lista sin cambiar nada', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    render(<CardsScreen />);
    const item = await itemWith('P');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Editar' }));
    await user.type(await screen.findByRole('textbox', { name: 'Pregunta' }), ' cambio');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Tarjetas' })).toBeTruthy();
    expect(bridge.workspace.cards.list()[0]?.question).toBe('P');
  });
});

describe('«Eliminar» una tarjeta', () => {
  it('[CA-022] la saca de la lista y avisa que está en la Papelera', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'Se va', answer: 'R' });
    bridge.workspace.cards.create({ question: 'Se queda', answer: 'R' });
    render(<CardsScreen />);
    const item = await itemWith('Se va');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('La tarjeta está en la Papelera.')).toBeTruthy();
    expect((await screen.findAllByRole('listitem')).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Se queda'),
    ]);
    expect(bridge.workspace.trash.list().map((entry) => entry.question)).toEqual(['Se va']);
  });

  it('si no puede eliminarla, avisa sin jerga y la tarjeta sigue en la lista', async () => {
    const { bridge, user } = openScreen();
    bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    bridge.handlers['cards.delete'] = async () => {
      throw new Error('disco lleno');
    };
    render(<CardsScreen />);
    const item = await itemWith('P');
    await user.click(within(item as HTMLElement).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('No pude eliminar la tarjeta. Probá de nuevo.')).toBeTruthy();
    expect(await itemWith('P')).toBeTruthy();
  });
});
