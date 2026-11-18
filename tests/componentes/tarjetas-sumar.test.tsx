import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../src/data/ids';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { readRows } from '../apoyo/base-cruda';
import { openBridge, type TestBridge } from '../apoyo/puente';

// «Sumar a mis repasos» (Fase 11) en Apuntes › «Tarjetas», contra el puente real y la base real:
// las tarjetas nuevas se eligen una por una y, antes de confirmar, un cuadro dice cuánto suman al
// repaso de las próximas 4 semanas.

const bridges: TestBridge[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

function setup(newCards: number) {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  const { workspace } = bridge;
  const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const questions = Array.from({ length: newCards }, (_, index) => `Nueva ${index + 1}`);
  for (const question of questions) {
    workspace.cards.create({ question, answer: 'R', subjectId: subject.id, topicId: null });
  }
  const user = userEvent.setup();
  const open = () => render(<CardsScreen subject={subject} />);
  return { bridge, workspace, subject, questions, user, open };
}

const activated = (bridge: TestBridge) =>
  readRows(bridge.file, "SELECT id FROM observations WHERE kind = 'card.activated'");

const sumButton = () => screen.getByRole('button', { name: 'Sumar a mis repasos' });

describe('[CA-087] «Sumar a mis repasos»', () => {
  it('[CA-087] el costo se dice antes de confirmar; «Cancelar» no suma nada y «Confirmar» suma las elegidas', async () => {
    const { bridge, questions, user, open } = setup(12);
    open();
    expect(await screen.findByText('0 elegidas')).toBeTruthy();
    // Hasta que haya una elegida, el botón no se puede tocar; y no es un segundo primario.
    expect(sumButton().hasAttribute('disabled')).toBe(true);
    expect(sumButton().getAttribute('data-button')).toBe('secondary');
    expect(
      [...document.querySelectorAll('[data-button="primary"]')].map((button) => button.textContent),
    ).toEqual(['Nueva tarjeta']);

    for (const question of questions.slice(0, 10)) {
      await user.click(screen.getByRole('checkbox', { name: question }));
    }
    expect(screen.getByText('10 elegidas')).toBeTruthy();
    expect(sumButton().hasAttribute('disabled')).toBe(false);

    await user.click(sumButton());
    const dialog = await screen.findByRole('dialog', { name: 'Sumar a mis repasos' });
    expect(
      within(dialog).getByText(
        'Agregar 10 tarjetas hoy suma entre 5 y 10 minutos de repaso repartidos en las próximas 4 semanas',
      ),
    ).toBeTruthy();
    // Todavía no se sumó nada.
    expect(activated(bridge)).toHaveLength(0);
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Cerrar', 'Confirmar', 'Cancelar']);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(activated(bridge)).toHaveLength(0);
    expect(screen.getByText('10 elegidas')).toBeTruthy();
    // El foco vuelve al botón que abrió el cuadro.
    expect(document.activeElement).toBe(sumButton());

    await user.click(sumButton());
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Sumar a mis repasos' })).getByRole(
        'button',
        { name: 'Confirmar' },
      ),
    );
    expect(await screen.findByText('Listo: 10 tarjetas nuevas sumadas a tus repasos')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(activated(bridge)).toHaveLength(10));
    expect(screen.getByText('0 elegidas')).toBeTruthy();
    expect(sumButton().hasAttribute('disabled')).toBe(true);
  });

  it('[CA-087] con 1 tarjeta, todo en singular', async () => {
    const { bridge, questions, user, open } = setup(3);
    open();
    await user.click(await screen.findByRole('checkbox', { name: questions[0] ?? '' }));
    expect(screen.getByText('1 elegida')).toBeTruthy();
    await user.click(sumButton());
    const dialog = await screen.findByRole('dialog', { name: 'Sumar a mis repasos' });
    const cost = await bridge.api['cards.activationCost']({ count: 1 });
    expect(
      within(dialog).getByText(
        cost.lowMinutes === cost.highMinutes
          ? `Agregar 1 tarjeta hoy suma cerca de ${cost.lowMinutes} ${cost.lowMinutes === 1 ? 'minuto' : 'minutos'} de repaso repartidos en las próximas 4 semanas`
          : `Agregar 1 tarjeta hoy suma entre ${cost.lowMinutes} y ${cost.highMinutes} minutos de repaso repartidos en las próximas 4 semanas`,
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Listo: 1 tarjeta nueva sumada a tus repasos')).toBeTruthy();
    await waitFor(() => expect(activated(bridge)).toHaveLength(1));
  });

  it('[CA-087] solo las tarjetas nuevas tienen casilla, que se maneja con el teclado y se llama como su pregunta', async () => {
    const { workspace, bridge, subject, user, open } = setup(0);
    const reviewed = workspace.cards.create({
      question: 'Ya repasada',
      answer: 'R',
      subjectId: subject.id,
      topicId: null,
    });
    workspace.cards.review({ cardId: reviewed.id, grade: 'good', attemptId: newId() });
    const paused = workspace.cards.create({
      question: 'En pausa',
      answer: 'R',
      subjectId: subject.id,
      topicId: null,
    });
    workspace.cards.setPaused({ cardId: paused.id, paused: true });
    workspace.cards.create({
      question: 'Recién escrita',
      answer: 'R',
      subjectId: subject.id,
      topicId: null,
    });
    open();
    expect(await screen.findByRole('checkbox', { name: 'Recién escrita' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Ya repasada' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'En pausa' })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    // Con teclado: Tab hasta la casilla y Espacio la tilda.
    const box = screen.getByRole('checkbox', { name: 'Recién escrita' });
    box.focus();
    await user.keyboard(' ');
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('1 elegida')).toBeTruthy();
    await user.keyboard(' ');
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(activated(bridge)).toHaveLength(0);
  });
});
