import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow } from './apoyo-ventana';

// Lo que encontró el revisor independiente de la Fase 10, en la ventana: la duda desde la pantalla
// de una tarjeta, «Repasar» en una tarjeta «En revisión» y deshacer la última desde el cierre.

afterEach(closeWindows);

const DESVIO = '¿Qué mide el desvío estándar?';

function withCast() {
  const opened = openWindow();
  seedDemoOrganization(opened.bridge.workspace);
  seedDemoCardCast(opened.bridge.workspace);
  return opened;
}

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const progress = () => screen.getByRole('status', { name: /^Llevás \d+ de \d+$/ });

// Apuntes › «Tarjetas» › «¿Qué mide el desvío estándar?».
async function openDesvio(user: ReturnType<typeof openWindow>['user']) {
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await user.click(
    within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
      name: 'Tarjetas',
    }),
  );
  await user.click(await screen.findByRole('button', { name: `Abrir la tarjeta «${DESVIO}»` }));
  await screen.findByRole('heading', { level: 3, name: 'Tarjeta' });
}

describe('sesión de estudio: lo que encontró el revisor, en la ventana', () => {
  it('[CA-076] «Guardar una duda» desde la pantalla de una tarjeta la deja en Progreso › «Dudas y revisiones» con esa tarjeta', async () => {
    const { user } = withCast();
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' });
    await openDesvio(user);
    await user.click(screen.getByRole('button', { name: 'Guardar una duda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guardar una duda' });
    // Es de esta tarjeta: no hay que elegir de cuál.
    expect(within(dialog).queryByLabelText('Sobre qué tarjeta')).toBeNull();
    await user.type(
      within(dialog).getByLabelText('Tu duda'),
      'No entiendo por qué se divide por n−1',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Guardé tu duda. La ves en Progreso › «Dudas y revisiones».'),
    ).toBeTruthy();
    await user.click(within(rail()).getByRole('button', { name: 'Progreso' }));
    expect(await screen.findByText('No entiendo por qué se divide por n−1')).toBeTruthy();
    expect(screen.getByText(`De la tarjeta: ${DESVIO}`)).toBeTruthy();
  });

  it('[CA-077] una tarjeta «En revisión» no tiene «Repasar» en su pantalla', async () => {
    const { user, api } = withCast();
    const overview = await api['study.overview']({});
    expect(overview.dueCount).toBe(60);
    const view = await api['study.start']({ sessionId: '01969f1e-0000-4000-8000-00000000fa01' });
    await api['study.flag']({
      sessionId: view.sessionId,
      activityId: view.current?.activityId ?? '',
      attemptId: '01969f1e-0000-4000-8000-00000000fa02',
    });
    render(<App />);
    await screen.findByRole('button', { name: /^Continuar: sesión de hoy/ });
    await openDesvio(user);
    expect(screen.getByText('Estado: En revisión')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Repasar' })).toBeNull();
  });

  it('[CA-067] en el cierre, Ctrl+Z (o «Deshacer») deshace la última calificación y vuelve a esa tarjeta', async () => {
    const { user } = withCast();
    render(<App />);
    // Con la máquina cargada, leer lo de hoy puede tardar más que el segundo por defecto.
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(
          false,
        ),
      { timeout: 15_000 },
    );
    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    await screen.findByText(DESVIO, {}, { timeout: 15_000 });
    for (let step = 0; step < 10; step += 1) {
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy(),
      );
      await user.keyboard(' 3');
    }
    expect(await screen.findByRole('heading', { name: /^Sesión terminada/ })).toBeTruthy();
    expect(screen.getByText('Calificaste la anterior: La sabía')).toBeTruthy();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(progress().textContent).toBe('9/10'));
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy();
    await user.keyboard(' 2');
    expect(await screen.findByRole('heading', { name: /^Sesión terminada/ })).toBeTruthy();
    expect(screen.getByText('Con dudas: 1')).toBeTruthy();
  });
});
