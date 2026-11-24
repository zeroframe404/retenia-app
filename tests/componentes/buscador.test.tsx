import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow } from './apoyo-ventana';
import './editor-apoyo';

// El buscador (Fase 12) en la ventana entera, contra el puente real y el elenco: Ctrl+K, flechas,
// Enter, Esc, lo que se ve sin resultados y la consulta dentro de una sesión.

afterEach(closeWindows);

const SLOW = { timeout: 15_000 };

function withCast() {
  return openWindow('real', undefined, { withCast: true });
}

async function openSearch(user: ReturnType<typeof openWindow>['user']) {
  await screen.findByRole('heading', { level: 2, name: 'Estudiar' });
  await user.keyboard('{Control>}k{/Control}');
  const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
  const input = within(dialog).getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' });
  return { dialog, input };
}

describe('abrir y cerrar el buscador', () => {
  it('[CA-034] Ctrl+K abre «Buscar» con el foco en el campo y Esc lo cierra volviendo a donde estaba', async () => {
    const { user } = withCast();
    render(<App />);
    const rail = screen.getByRole('navigation', { name: 'Riel lateral' });
    const before = within(rail).getByRole('button', { name: 'Materiales' });
    before.focus();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    expect(document.activeElement).toBe(
      within(dialog).getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(before);
  });

  it('«Buscar» del riel abre el mismo cuadro', async () => {
    const { user } = withCast();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: /^Buscar/,
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Buscar' })).toBeTruthy();
  });

  it('sin texto, con nada abierto todavía, dice cómo empezar', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog } = await openSearch(user);
    expect(within(dialog).getByText('Todavía no abriste nada. Escribí para buscar.')).toBeTruthy();
  });
});

describe('buscar', () => {
  it('[CA-095] escribir «desvio» muestra las tarjetas primero, con «desvío» resaltado', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'desvio');
    const first = await within(dialog).findAllByRole('option', undefined, SLOW);
    expect(first.length).toBeGreaterThan(3);
    expect(first[0]?.textContent).toContain('¿Qué mide el desvío estándar?');
    const mark = first[0]?.querySelector('mark');
    expect(mark?.textContent).toBe('desvío');
  });

  it('los resultados se agrupan por tipo, con un título por grupo', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'media');
    await within(dialog).findAllByRole('option', undefined, SLOW);
    const groups = within(dialog)
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(expect.arrayContaining(['Apuntes', 'Tarjetas']));
    // Va primero el grupo del mejor resultado.
    expect(groups[0]).toBe('Tarjetas');
  });

  it('[CA-101] sin resultados dice «No encontré nada con “zzzz”» y sugiere probar otra palabra', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'zzzz');
    expect(await within(dialog).findByText('No encontré nada con “zzzz”', {}, SLOW)).toBeTruthy();
    expect(within(dialog).getByText('Probá con otra palabra o con menos letras.')).toBeTruthy();
    expect(within(dialog).queryByRole('option')).toBeNull();
  });

  it('el texto buscado se muestra como texto, nunca como código', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, '<img src=x onerror=alert(1)>');
    const message = await within(dialog).findByText(/No encontré nada con/, {}, SLOW);
    expect(message.textContent).toBe('No encontré nada con “<img src=x onerror=alert(1)>”');
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('un texto larguísimo o con símbolos no muestra ningún error', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.click(input);
    await user.paste(`${'x'.repeat(2000)}"*()[]`);
    await within(dialog).findByText(/No encontré nada con/, {}, SLOW);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});

describe('el teclado', () => {
  it('las flechas recorren los resultados y Enter abre el elegido', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'tipo:tarjeta desvio');
    const options = await within(dialog).findAllByRole('option', undefined, SLOW);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(options[2]?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[2]?.id);
    await user.keyboard('{ArrowUp}');
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
    const wanted = options[1]?.textContent ?? '';
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // La pantalla de esa tarjeta: su título y su pregunta.
    await screen.findByRole('heading', { name: 'Tarjeta' }, SLOW);
    expect(wanted).toContain('Estadística básica');
    await screen.findByRole('button', { name: 'Practicar ahora' }, SLOW);
    expect(document.body.textContent).toContain('desvío');
  });

  it('Enter sobre una tarjeta abre su pantalla en Apuntes › «Tarjetas»', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'desvio');
    await within(dialog).findAllByRole('option', undefined, SLOW);
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Tarjeta' }, SLOW);
    expect(
      (await screen.findAllByText('¿Qué mide el desvío estándar?', {}, SLOW)).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: 'Practicar ahora' }, SLOW)).toBeTruthy();
  });

  it('Enter sobre un renglón de una nota abre la nota', async () => {
    const { user } = withCast();
    render(<App />);
    const { dialog, input } = await openSearch(user);
    await user.type(input, 'sqrt(n');
    await within(dialog).findAllByRole('option', undefined, SLOW);
    await user.keyboard('{Enter}');
    expect(await screen.findByDisplayValue('Intervalos de confianza', {}, SLOW)).toBeTruthy();
  });

  it('lo que abrís queda entre lo abierto hace poco', async () => {
    const { user } = withCast();
    render(<App />);
    const first = await openSearch(user);
    await user.type(first.input, 'desvio');
    await within(first.dialog).findAllByRole('option', undefined, SLOW);
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Tarjeta' }, SLOW);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    expect(await within(dialog).findByText('Abiertos hace poco', {}, SLOW)).toBeTruthy();
    expect(within(dialog).getAllByRole('option')[0]?.textContent).toContain(
      '¿Qué mide el desvío estándar?',
    );
  });
});

describe('dentro de una sesión', () => {
  async function startSession(user: ReturnType<typeof openWindow>['user']) {
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(
          false,
        ),
      SLOW,
    );
    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    await screen.findByText('¿Qué mide el desvío estándar?', {}, SLOW);
  }

  it('[CA-102] Ctrl+K abre un resultado en un panel lateral y, al cerrarlo, la tarjeta y el borrador siguen como estaban', async () => {
    const { user } = withCast();
    render(<App />);
    await startSession(user);
    const field = screen.getByPlaceholderText('Tu respuesta…');
    await user.type(field, 'mi borrador a medias');

    await user.keyboard('{Control>}k{/Control}');
    const search = await screen.findByRole('dialog', { name: 'Buscar' });
    await user.type(
      within(search).getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' }),
      'tipo:nota intervalos',
    );
    await within(search).findAllByRole('option', undefined, SLOW);
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog', { name: 'Intervalos de confianza' }, SLOW);
    expect(within(panel).getByText(/Un intervalo de confianza da un rango/)).toBeTruthy();
    // La sesión sigue ahí detrás: no se fue a Apuntes.
    expect(screen.queryByRole('navigation', { name: 'Riel lateral' })).toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    const after = screen.getByPlaceholderText<HTMLTextAreaElement>('Tu respuesta…');
    expect(after.value).toBe('mi borrador a medias');
    expect(document.activeElement).toBe(after);
  });

  it('en la sesión, abrir una tarjeta la muestra en el panel con su pregunta y su respuesta', async () => {
    const { user } = withCast();
    render(<App />);
    await startSession(user);
    await user.keyboard('{Control>}k{/Control}');
    const search = await screen.findByRole('dialog', { name: 'Buscar' });
    await user.type(
      within(search).getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' }),
      'tipo:tarjeta varianza',
    );
    await within(search).findAllByRole('option', undefined, SLOW);
    await user.keyboard('{Enter}');
    const panel = await screen.findByRole('dialog', { name: /varianza/i }, SLOW);
    expect(
      within(panel).getByText('El promedio de los cuadrados de las distancias a la media.'),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('¿Qué mide el desvío estándar?')).toBeTruthy();
  });
});
