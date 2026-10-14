import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La pantalla «Tarjetas» contra el puente real: el manejador del principal y una base real en un
// archivo temporal, sin Electron en el medio. Los mensajes que salen de la ventana quedan en
// bridge.sent.
const bridges: TestBridge[] = [];
function openScreen() {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  const user = userEvent.setup();
  render(<CardsScreen />);
  return { bridge, user };
}
afterEach(() => {
  cleanup();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

const created = (bridge: TestBridge) =>
  bridge.sent.filter((message) => message.channel === 'cards.create');
const reviewed = (bridge: TestBridge) =>
  bridge.sent.filter((message) => message.channel === 'cards.review');

async function fillAndSave(
  user: ReturnType<typeof userEvent.setup>,
  { question, answer }: { question?: string; answer?: string },
) {
  await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
  if (question !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), question);
  }
  if (answer !== undefined) {
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), answer);
  }
  await user.click(screen.getByRole('button', { name: 'Guardar' }));
}

describe('pantalla «Tarjetas»: alta', () => {
  it('sin tarjetas muestra el estado vacío con la invitación a crear la primera', async () => {
    openScreen();
    expect(await screen.findByRole('heading', { name: 'Tarjetas' })).toBeTruthy();
    expect(await screen.findByText(/Todavía no tenés tarjetas/)).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('mientras las tarjetas se leen no muestra el estado vacío: no se ve una lista vacía que después se llena', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((open) => {
      release = open;
    });
    const list = bridge.handlers['cards.list'];
    bridge.handlers['cards.list'] = async (request) => {
      await gate;
      return list(request);
    };
    await bridge.api['cards.create']({ question: 'Ya guardada', answer: 'x' });
    window.retenia = bridge.api as unknown as typeof window.retenia;
    render(<CardsScreen />);

    expect(await screen.findByRole('heading', { name: 'Tarjetas' })).toBeTruthy();
    expect(screen.queryByText(/Todavía no tenés tarjetas/)).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    release();
    expect(await screen.findByText('Ya guardada')).toBeTruthy();
    expect(screen.queryByText(/Todavía no tenés tarjetas/)).toBeNull();
  });

  it('[CA-009] «Nueva tarjeta» con pregunta y respuesta y «Guardar»: cartel «Tarjeta guardada» y la tarjeta queda primera', async () => {
    const { user } = openScreen();
    await fillAndSave(user, { question: 'Una anterior', answer: 'x' });
    await screen.findByText('Una anterior');
    await fillAndSave(user, { question: '¿Capital de Francia?', answer: 'París' });

    const notice = await screen.findByText('Tarjeta guardada');
    expect(notice.closest('[role="status"]')).not.toBeNull();
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0] as HTMLElement).getByText('¿Capital de Francia?')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Una anterior')).toBeTruthy();
    // El formulario se cierra al guardar.
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });

  it('[CA-011] sin pregunta marca el campo «Pregunta» con «Escribí la pregunta», conserva «Roma» y no llama al puente', async () => {
    const { bridge, user } = openScreen();
    await fillAndSave(user, { answer: 'Roma' });

    const question = screen.getByRole('textbox', { name: 'Pregunta' });
    expect(question.getAttribute('aria-invalid')).toBe('true');
    const message = screen.getByText('Escribí la pregunta');
    expect(question.getAttribute('aria-describedby')).toBe(message.id);
    expect((screen.getByRole('textbox', { name: 'Respuesta' }) as HTMLTextAreaElement).value).toBe(
      'Roma',
    );
    expect(document.activeElement).toBe(question);
    expect(created(bridge)).toEqual([]);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    // Y el botón sigue disponible para volver a intentar.
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('[CA-011] con la pregunta de solo espacios pasa lo mismo que sin pregunta', async () => {
    const { bridge, user } = openScreen();
    await fillAndSave(user, { question: '    ', answer: 'Roma' });
    expect(screen.getByText('Escribí la pregunta')).toBeTruthy();
    expect(created(bridge)).toEqual([]);
  });

  it('sin respuesta marca «Respuesta» con «Escribí la respuesta» y conserva la pregunta', async () => {
    const { bridge, user } = openScreen();
    await fillAndSave(user, { question: '¿Capital de Italia?' });
    const answer = screen.getByRole('textbox', { name: 'Respuesta' });
    expect(answer.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Escribí la respuesta')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Pregunta' }) as HTMLTextAreaElement).value).toBe(
      '¿Capital de Italia?',
    );
    expect(created(bridge)).toEqual([]);
  });

  it('al corregir el campo marcado y guardar, la marca desaparece y se crea la tarjeta', async () => {
    const { bridge, user } = openScreen();
    await fillAndSave(user, { answer: 'Roma' });
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), '¿Capital de Italia?');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Tarjeta guardada')).toBeTruthy();
    expect(created(bridge)).toHaveLength(1);
    expect(screen.queryByText('Escribí la pregunta')).toBeNull();
  });

  it('un doble clic en «Guardar» crea una sola tarjeta', async () => {
    const { bridge, user } = openScreen();
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), '¿Capital de Francia?');
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), 'París');
    await user.dblClick(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Tarjeta guardada');
    expect(created(bridge)).toHaveLength(1);
    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  });

  it('si el principal falla al guardar, avisa sin jerga, conserva lo escrito y deja volver a intentar', async () => {
    const { bridge, user } = openScreen();
    bridge.handlers['cards.create'] = async () => {
      throw new Error('disco lleno');
    };
    await fillAndSave(user, { question: '¿Capital de Francia?', answer: 'París' });
    expect(await screen.findByText('No pude guardar la tarjeta. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/disco lleno/)).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Pregunta' }) as HTMLTextAreaElement).value).toBe(
      '¿Capital de Francia?',
    );
    expect((screen.getByRole('textbox', { name: 'Respuesta' }) as HTMLTextAreaElement).value).toBe(
      'París',
    );
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('«Cancelar» cierra el formulario sin crear nada', async () => {
    const { bridge, user } = openScreen();
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), 'Algo a medias');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Pregunta' })).toBeNull();
    expect(created(bridge)).toEqual([]);
  });

  it('un texto pegado muy largo, con ñ, tildes y emoji, se guarda completo', async () => {
    const { bridge, user } = openScreen();
    const long = `${'Año nuevo, cañón y corazón 🙂 '.repeat(2000)}fin`;
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.click(screen.getByRole('textbox', { name: 'Pregunta' }));
    await user.paste(long);
    await user.click(screen.getByRole('textbox', { name: 'Respuesta' }));
    await user.paste('Respuesta con ñ y 🙂');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Tarjeta guardada');
    const [message] = created(bridge);
    expect(message?.request).toMatchObject({ question: long.trim() });
  });

  it('un texto de más del tope se marca junto al campo y no se pierde', async () => {
    const { bridge, user } = openScreen();
    const tooLong = 'a'.repeat(100_001);
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.click(screen.getByRole('textbox', { name: 'Pregunta' }));
    await user.paste(tooLong);
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), 'R');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      screen.getByText('La pregunta es demasiado larga: el máximo es 100.000 caracteres'),
    ).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Pregunta' }) as HTMLTextAreaElement).value).toBe(
      tooLong,
    );
    expect(created(bridge)).toEqual([]);
  });
});

describe('pantalla «Tarjetas»: repaso', () => {
  async function openReview(user: ReturnType<typeof userEvent.setup>) {
    await fillAndSave(user, { question: '¿Capital de Francia?', answer: 'París' });
    const item = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Repasar' }));
  }

  it('al repasar muestra la pregunta sola: la respuesta y las calificaciones aparecen con «Mostrar respuesta»', async () => {
    const { user } = openScreen();
    await openReview(user);
    expect(await screen.findByText('¿Capital de Francia?')).toBeTruthy();
    expect(screen.queryByText('París')).toBeNull();
    for (const name of ['No la sabía', 'Con dudas', 'La sabía']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    expect(await screen.findByText('París')).toBeTruthy();
    for (const name of ['No la sabía', 'Con dudas', 'La sabía']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeNull();
  });

  it('[CA-010] «Repasar», «Mostrar respuesta» y «La sabía» muestran «Próximo repaso: miércoles 17/03/2027»', async () => {
    const { bridge, user } = openScreen();
    await openReview(user);
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: 'La sabía' }));
    expect(await screen.findByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy();
    expect(reviewed(bridge)).toHaveLength(1);
    expect(reviewed(bridge)[0]?.request).toMatchObject({ grade: 'good' });
  });

  it('«Con dudas» y «No la sabía» muestran el martes 16/03/2027', async () => {
    for (const [name, grade] of [
      ['Con dudas', 'hard'],
      ['No la sabía', 'again'],
    ] as const) {
      const { bridge, user } = openScreen();
      await openReview(user);
      await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
      await user.click(screen.getByRole('button', { name }));
      expect(await screen.findByText('Próximo repaso: martes 16/03/2027')).toBeTruthy();
      expect(reviewed(bridge)[0]?.request).toMatchObject({ grade });
      cleanup();
    }
  });

  it('un doble clic en «La sabía» registra un solo repaso', async () => {
    const { bridge, user } = openScreen();
    await openReview(user);
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await user.dblClick(screen.getByRole('button', { name: 'La sabía' }));
    await screen.findByText('Próximo repaso: miércoles 17/03/2027');
    expect(reviewed(bridge)).toHaveLength(1);
  });

  it('«Volver a las tarjetas» deja la lista con el próximo repaso de esa tarjeta', async () => {
    const { user } = openScreen();
    await openReview(user);
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: 'La sabía' }));
    await user.click(await screen.findByRole('button', { name: 'Volver a las tarjetas' }));
    const item = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    expect(within(item).getByText('Próximo repaso: miércoles 17/03/2027')).toBeTruthy();
  });

  it('una tarjeta sin repasar dice «Todavía sin repasar»', async () => {
    const { user } = openScreen();
    await fillAndSave(user, { question: 'P', answer: 'R' });
    const item = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    expect(within(item).getByText('Todavía sin repasar')).toBeTruthy();
  });

  it('si el repaso falla, avisa sin jerga y deja volver a calificar', async () => {
    const { bridge, user } = openScreen();
    await openReview(user);
    bridge.handlers['cards.review'] = async () => {
      throw new Error('base bloqueada');
    };
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: 'La sabía' }));
    expect(await screen.findByText('No pude guardar el repaso. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect(screen.getByRole('button', { name: 'La sabía' })).toBeTruthy();
  });
});

describe('pantalla «Tarjetas»: carga', () => {
  it('si no puede leer las tarjetas, avisa sin jerga y ofrece «Reintentar»', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    bridge.handlers['cards.list'] = async () => {
      throw new Error('archivo dañado');
    };
    window.retenia = bridge.api as unknown as typeof window.retenia;
    const user = userEvent.setup();
    render(<CardsScreen />);
    expect(await screen.findByText('No pude cargar tus tarjetas. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/archivo dañado/)).toBeNull();

    bridge.handlers['cards.list'] = async () => ({ cards: [] });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Todavía no tenés tarjetas/)).toBeTruthy();
  });
});
