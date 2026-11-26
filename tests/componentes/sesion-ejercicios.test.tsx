import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow } from './apoyo-ventana';

// Los ejercicios dentro de la sesión de Estudiar (Fase 18), en la ventana.

afterEach(async () => {
  await closeWindows();
  delete window.reteniaCierre;
});

const SLOW = { timeout: 10_000 };

// El 16/03: se califican por el puente las tarjetas de antes del primer ejercicio, se pausa y se
// retoma desde Estudiar.
async function openAtExercise() {
  const { user, api } = openWindow('real', demoClock(1), { withCast: 'tarjetas' });
  const sessionId = crypto.randomUUID();
  let view = await api['study.start']({ sessionId, minutes: 25 });
  while (view.current && view.current.card.activityType === null) {
    view = await api['study.grade']({
      sessionId,
      activityId: view.current.activityId,
      attemptId: crypto.randomUUID(),
      grade: 'good',
      answer: null,
    });
  }
  const done = view.progress.done;
  const total = view.progress.total;
  await api['study.pause']({ sessionId });

  render(<App />);
  await user.click(
    await screen.findByRole(
      'button',
      { name: `Continuar: sesión de hoy (${done} de ${total})` },
      SLOW,
    ),
  );
  const session = await screen.findByRole('main', { name: 'Sesión de estudio' }, SLOW);
  await within(session).findByRole('heading', { name: 'Ejercicio' }, SLOW);
  return { user, api, sessionId, session, done, total, cardId: view.current?.cardId ?? '' };
}

describe('un ejercicio dentro de la sesión', () => {
  it('se contesta ahí mismo, sin salir: «Enviar», «Siguiente» y la sesión sigue con lo que viene', async () => {
    const { user, session, done, total } = await openAtExercise();
    expect(within(session).queryByRole('button', { name: 'Mostrar respuesta' })).toBeNull();
    expect(within(session).queryByRole('button', { name: 'Volver a las tarjetas' })).toBeNull();
    expect(within(session).getByRole('button', { name: 'Pausar' })).toBeTruthy();
    // Antes de enviar todavía se puede deshacer la tarjeta de antes.
    expect(within(session).getByRole('button', { name: 'Deshacer' })).toBeTruthy();

    const send = await within(session).findByRole('button', { name: 'Enviar' }, SLOW);
    // Espacio no muestra nada en un ejercicio.
    await user.keyboard(' ');
    expect(within(session).queryByText('Respuesta de referencia')).toBeNull();
    const number = within(session).queryByRole('textbox', {
      name: 'Tu respuesta, con coma o con punto',
    });
    if (number) {
      await user.type(number, '1');
    } else {
      await user.click(within(session).getAllByRole('radio')[0] as HTMLElement);
    }
    await user.click(send);
    const next = await within(session).findByRole('button', { name: 'Siguiente' }, SLOW);
    expect(within(session).queryByRole('button', { name: 'Deshacer' })).toBeNull();
    await user.click(next);
    await within(session).findByRole('button', { name: 'Mostrar respuesta' }, SLOW);
    await waitFor(() =>
      expect(within(session).getByRole('status', { name: /^Llevás/ }).textContent).toBe(
        `${done + 1}/${total}`,
      ),
    );
    expect(within(session).queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('si cerrás el programa después de «Enviar» y antes de «Siguiente», queda guardado y no te lo vuelve a pedir', async () => {
    const closing = new Set<() => Promise<void> | void>();
    window.reteniaCierre = {
      alCerrar: (handler) => {
        closing.add(handler);
        return () => {
          closing.delete(handler);
        };
      },
    };
    const { user, api, sessionId, session, cardId } = await openAtExercise();
    const send = await within(session).findByRole('button', { name: 'Enviar' }, SLOW);
    const number = within(session).queryByRole('textbox', {
      name: 'Tu respuesta, con coma o con punto',
    });
    if (number) {
      await user.type(number, '1');
    } else {
      await user.click(within(session).getAllByRole('radio')[0] as HTMLElement);
    }
    await user.click(send);
    await within(session).findByRole('button', { name: 'Siguiente' }, SLOW);

    // El principal avisa que se cierra la ventana y espera a que todo quede guardado.
    await Promise.all([...closing].map(async (handler) => handler()));
    await api['study.pause']({ sessionId });
    const resumed = await api['study.resume']({ sessionId });
    expect(resumed.current?.cardId).not.toBe(cardId);
  });
});
