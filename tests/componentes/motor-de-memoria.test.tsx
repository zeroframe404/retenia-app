import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { inBuenosAires } from '../apoyo/fechas';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Lo que la Fase 09 suma a la pestaña «Tarjetas»: «Deshacer» después de calificar, los renglones
// «Anulado» del historial y «¿Por qué hoy?», contra el puente real y una base real.

const bridges: TestBridge[] = [];
afterEach(() => {
  cleanup();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

function setup() {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  const subject = bridge.workspace.subjects.create({
    name: 'Estadística básica',
    makeActive: true,
  });
  const user = userEvent.setup();
  render(<CardsScreen subject={subject} />);
  const add = (question: string, answer = 'R') =>
    bridge.workspace.cards.create({ question, answer, subjectId: subject.id });
  return { bridge, user, add, workspace: bridge.workspace };
}

type User = ReturnType<typeof userEvent.setup>;

async function openCard(user: User, question: string) {
  await user.click(await screen.findByRole('button', { name: `Abrir la tarjeta «${question}»` }));
  await screen.findByRole('heading', { name: 'Tarjeta' });
}

async function gradeFromDetail(user: User, question: string, grade: string) {
  await openCard(user, question);
  await user.click(screen.getByRole('button', { name: 'Repasar' }));
  await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
  await user.click(screen.getByRole('button', { name: grade }));
}

const sentOn = (bridge: TestBridge, channel: string) =>
  bridge.sent.filter((message) => message.channel === channel);

describe('«Deshacer» un repaso', () => {
  it('[CA-063] después de calificar aparece «Deshacer»; al tocarlo, el repaso se anula y la tarjeta vuelve a la pregunta sin calificar', async () => {
    const { bridge, user, add } = setup();
    add('¿Capital de Francia?', 'París');
    await gradeFromDetail(user, '¿Capital de Francia?', 'La sabía');
    expect(await screen.findByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Repaso anulado. La tarjeta quedó sin repasar.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy();
    expect(screen.queryByText('París')).toBeNull();
    const review = sentOn(bridge, 'cards.review')[0]?.request as
      | { cardId: string; attemptId: string }
      | undefined;
    expect(sentOn(bridge, 'cards.undoReview').map((message) => message.request)).toEqual([
      { cardId: review?.cardId, attemptId: review?.attemptId },
    ]);
  });

  it('[CA-063] con historial, «Deshacer» dice el próximo repaso de antes, y volver a calificar es otro intento', async () => {
    const { bridge, user, add, workspace } = setup();
    const card = add('¿Qué es la varianza?');
    workspace.cards.plantHistory([
      {
        cardId: card.id,
        createdAt: inBuenosAires('01/03/2027 10:00'),
        reviews: [{ at: inBuenosAires('10/03/2027 10:00'), grade: 'good' }],
      },
    ]);
    await gradeFromDetail(user, '¿Qué es la varianza?', 'Con dudas');
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(
      await screen.findByText('Repaso anulado. Próximo repaso: viernes 12/03/2027'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: 'La sabía' }));
    await screen.findByRole('button', { name: 'Deshacer' });
    const attempts = sentOn(bridge, 'cards.review').map(
      (message) => (message.request as { attemptId: string }).attemptId,
    );
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts).size).toBe(2);
  });

  it('[CA-063] el historial muestra el repaso deshecho con «Anulado»', async () => {
    const { user, add } = setup();
    add('¿Capital de Francia?', 'París');
    await gradeFromDetail(user, '¿Capital de Francia?', 'La sabía');
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await user.click(await screen.findByRole('button', { name: 'Volver a las tarjetas' }));
    await openCard(user, '¿Capital de Francia?');
    expect(screen.getByText('Todavía sin repasar')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Historial' }));
    const rows = within(
      await screen.findByRole('list', { name: 'Repasos de la tarjeta' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['15/03/2027 · La sabía · Anulado']);
  });

  it('un segundo repaso el mismo día figura en el historial como del mismo día y no cambia la fecha', async () => {
    const { user, add, workspace } = setup();
    const card = add('¿Capital de Italia?', 'Roma');
    workspace.cards.review({
      cardId: card.id,
      grade: 'again',
      attemptId: '01969f1e-0000-4000-8000-000000000c01',
    });
    await gradeFromDetail(user, '¿Capital de Italia?', 'La sabía');
    expect(await screen.findByText('Próximo repaso: martes 16/03/2027')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    await openCard(user, '¿Capital de Italia?');
    await user.click(screen.getByRole('button', { name: 'Historial' }));
    const rows = within(
      await screen.findByRole('list', { name: 'Repasos de la tarjeta' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '15/03/2027 · No la sabía',
      '15/03/2027 · La sabía · Otro repaso del mismo día: no cambió la fecha',
    ]);
  });
});

describe('«¿Por qué hoy?»', () => {
  it('[CA-065] en una tarjeta que vence hoy: los días desde el último repaso, cómo salió y unos N de cada 10, con la estimación general', async () => {
    const { user, add, workspace } = setup();
    const card = add('¿Qué mide el desvío estándar?');
    workspace.cards.plantHistory([
      {
        cardId: card.id,
        createdAt: inBuenosAires('01/02/2027 10:00'),
        reviews: [
          { at: inBuenosAires('16/02/2027 10:00'), grade: 'again' },
          { at: inBuenosAires('18/02/2027 10:00'), grade: 'good' },
          { at: inBuenosAires('20/02/2027 10:00'), grade: 'hard' },
        ],
      },
    ]);
    await openCard(user, '¿Qué mide el desvío estándar?');
    await user.click(screen.getByRole('button', { name: '¿Por qué hoy?' }));
    expect(
      await screen.findByText(
        'La viste hace 23 días; la última vez te costó; probabilidad estimada de recordarla: unos 7 de cada 10',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Estimación general (sin datos tuyos)')).toBeTruthy();
  });

  it('[CA-065] también durante el repaso, antes de mostrar la respuesta', async () => {
    const { user, add, workspace } = setup();
    const card = add('¿Capital de Francia?', 'París');
    workspace.cards.plantHistory([
      {
        cardId: card.id,
        createdAt: inBuenosAires('01/03/2027 10:00'),
        reviews: [{ at: inBuenosAires('14/03/2027 10:00'), grade: 'good' }],
      },
    ]);
    await openCard(user, '¿Capital de Francia?');
    await user.click(screen.getByRole('button', { name: 'Repasar' }));
    await user.click(await screen.findByRole('button', { name: '¿Por qué hoy?' }));
    expect(
      await screen.findByText(
        'La viste hace 1 día; la última vez te salió bien; probabilidad estimada de recordarla: unos 9 de cada 10',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('París')).toBeNull();
  });

  it('[CA-065] una tarjeta nueva dice que es nueva', async () => {
    const { user, add } = setup();
    add('¿Capital de Portugal?', 'Lisboa');
    await openCard(user, '¿Capital de Portugal?');
    await user.click(screen.getByRole('button', { name: '¿Por qué hoy?' }));
    expect(await screen.findByText('Es nueva: todavía no la repasaste.')).toBeTruthy();
    expect(screen.getByText('Estimación general (sin datos tuyos)')).toBeTruthy();
  });

  it('con 5 intentos o más deja de decir «Estimación general»; la frase nunca tiene decimales', async () => {
    const { user, add, workspace } = setup();
    const card = add('¿Capital de España?', 'Madrid');
    workspace.cards.plantHistory([
      {
        cardId: card.id,
        createdAt: inBuenosAires('01/01/2027 10:00'),
        reviews: ['02/01', '05/01', '15/01', '05/02', '01/03'].map((day) => ({
          at: inBuenosAires(`${day}/2027 10:00`),
          grade: 'good' as const,
        })),
      },
    ]);
    await openCard(user, '¿Capital de España?');
    await user.click(screen.getByRole('button', { name: '¿Por qué hoy?' }));
    const phrase = await screen.findByText(/^La viste hace 14 días; la última vez te salió bien;/);
    expect(phrase.textContent).toMatch(/unos \d{1,2} de cada 10$/);
    expect(phrase.textContent).not.toMatch(/[.,]\d/);
    expect(screen.queryByText('Estimación general (sin datos tuyos)')).toBeNull();
  });
});
