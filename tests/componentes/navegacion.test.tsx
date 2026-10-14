import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Navigation } from '../../src/renderer/Navigation';

// La barra provisoria de secciones (el riel llega en la Fase 06).

afterEach(cleanup);

describe('barra de secciones', () => {
  it('tiene «Tarjetas», «Papelera», «Actividad reciente» y «Ajustes», marca la actual y avisa cuál se tocó', async () => {
    const chosen: string[] = [];
    const user = userEvent.setup();
    render(<Navigation current="cards" onChange={(screenName) => chosen.push(screenName)} />);
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Tarjetas',
      'Papelera',
      'Actividad reciente',
      'Ajustes',
    ]);
    expect(within(nav).getByRole('button', { name: 'Tarjetas' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(nav).getByRole('button', { name: 'Papelera' }).getAttribute('aria-current'),
    ).toBeNull();
    await user.click(within(nav).getByRole('button', { name: 'Papelera' }));
    await user.click(within(nav).getByRole('button', { name: 'Ajustes' }));
    expect(chosen).toEqual(['trash', 'settings']);
  });

  it('no usa elementos de lista: las listas de la ventana son solo las de los datos', () => {
    render(<Navigation current="trash" onChange={() => undefined} />);
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
