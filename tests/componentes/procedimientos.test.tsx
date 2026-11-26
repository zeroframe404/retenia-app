import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow } from './apoyo-ventana';

// Fase 18, en la ventana.

afterEach(closeWindows);

const SLOW = { timeout: 10_000 };
const PROCEDURE = 'Calcular un intervalo de confianza para la media';

function withCast() {
  return openWindow('real', undefined, { withCast: 'tarjetas' });
}

type User = ReturnType<typeof openWindow>['user'];

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });

// Ctrl+K, escribir y «Practicar ahora».
async function practiceByName(user: User, name: string) {
  await user.keyboard('{Control>}k{/Control}');
  const dialog = await screen.findByRole('dialog', { name: 'Buscar' }, SLOW);
  await user.type(within(dialog).getByRole('combobox', { name: /Buscar/ }), name);
  // El resultado marcado es el primero: se espera a que sea el buscado.
  await waitFor(
    () => expect(within(dialog).getAllByRole('option')[0]?.textContent).toContain(name),
    SLOW,
  );
  await user.click(within(dialog).getByRole('button', { name: 'Practicar ahora' }));
}

async function backToCardsByRail(user: User) {
  await user.click(within(rail()).getByRole('button', { name: 'Ajustes' }));
  await screen.findByRole('heading', { level: 2, name: 'Ajustes' }, SLOW);
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await user.click(
    within(await screen.findByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole(
      'button',
      { name: 'Tarjetas' },
    ),
  );
}

describe('volver a «Tarjetas» después de «Practicar ahora»', () => {
  it('muestra la lista: la actividad no se vuelve a abrir sola', async () => {
    const { user } = withCast();
    render(<App />);
    await screen.findByRole('button', { name: 'Empezar' }, SLOW);
    await practiceByName(user, PROCEDURE);
    await screen.findByRole('heading', { name: 'Ejemplo resuelto' }, SLOW);
    await backToCardsByRail(user);
    await screen.findByText('180 tarjetas', {}, SLOW);
    expect(screen.queryByRole('heading', { name: 'Ejemplo resuelto' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'Ejercicio' })).toBeNull();
  });
});
