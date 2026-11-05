import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { App } from '../../src/renderer/App';
import { readRows } from '../apoyo/base-cruda';
import { closeWindows, openWindow } from './apoyo-ventana';

// La sesión de estudio de la Fase 10 en la ventana entera, contra el puente real y el elenco:
// primero la pregunta, las teclas, «Deshacer», el borrador, el doble clic, «La tarjeta está mal»,
// pausar y continuar, el cierre y la duda.

afterEach(closeWindows);

function withCast() {
  const opened = openWindow();
  seedDemoOrganization(opened.bridge.workspace);
  seedDemoCardCast(opened.bridge.workspace);
  return opened;
}

const progress = () => screen.getByRole('status', { name: /^Llevás \d+ de \d+$/ });

// Leer lo de hoy y armar la sesión recorre las 180 tarjetas del elenco: con la máquina cargada (la
// red corre varias copias del proyecto a la vez) puede tardar más que el segundo que se espera por
// defecto. Lo que se espera no cambia; solo cuánto.
const SLOW = { timeout: 15_000 };

async function startSession(user: ReturnType<typeof openWindow>['user']) {
  render(<App />);
  // Mientras se lee lo de hoy, «Empezar» está pero no se puede tocar.
  await waitFor(
    () =>
      expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(false),
    SLOW,
  );
  await user.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByText('¿Qué mide el desvío estándar?', {}, SLOW);
}

const sessionReviews = (file: string) =>
  readRows(
    file,
    "SELECT id FROM observations WHERE kind = 'review.graded' AND session_id IS NOT NULL",
  );

describe('sesión de estudio en la ventana', () => {
  it('[CA-066] la tarjeta aparece sin el riel, con «PRÁCTICA AUTÓNOMA», «0/10», «Pausar», su camino y solo «Mostrar respuesta»: no hay botones para calificar', async () => {
    const { user } = withCast();
    await startSession(user);
    expect(screen.queryByRole('navigation', { name: 'Riel lateral' })).toBeNull();
    expect(screen.getByText('PRÁCTICA AUTÓNOMA')).toBeTruthy();
    expect(progress().textContent).toBe('0/10');
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    expect(screen.getByText('Estadística básica › Media y dispersión')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tu respuesta…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy();
    for (const name of ['No la sabía', 'Con dudas', 'La sabía']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('Cuánto se alejan, en promedio, los datos de la media.')).toBeNull();
    // El foco está en la pregunta: Espacio la muestra, no escribe en el campo.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Pregunta');
  });

  it('[CA-066] [CA-069] «Mostrar respuesta» muestra la respuesta y lo escrito al lado; «La sabía» con doble clic avanza una sola tarjeta', async () => {
    const { user, bridge } = withCast();
    await startSession(user);
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'cuánto se alejan');
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    expect(screen.getByText('Cuánto se alejan, en promedio, los datos de la media.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tu respuesta' })).toBeTruthy();
    expect(screen.getByText('cuánto se alejan')).toBeTruthy();
    await user.dblClick(screen.getByRole('button', { name: 'La sabía' }));
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    expect(sessionReviews(bridge.file)).toHaveLength(1);
    expect(screen.queryByText('¿Qué mide el desvío estándar?')).toBeNull();
  });

  it('[CA-072] [CA-067] Espacio muestra, 2 califica «Con dudas», Ctrl+Z deshace y Esc pausa: Estudiar ofrece continuar', async () => {
    const { user } = withCast();
    await startSession(user);
    expect(screen.getByText(/^Teclas: Espacio muestra la respuesta/)).toBeTruthy();
    await user.keyboard(' ');
    expect(screen.getByText('Cuánto se alejan, en promedio, los datos de la media.')).toBeTruthy();
    await user.keyboard('2');
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    expect(screen.getByText('Calificaste la anterior: Con dudas')).toBeTruthy();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(progress().textContent).toBe('0/10'));
    expect(screen.getByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'La sabía' })).toBeNull();
    await user.keyboard(' 3');
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('button', { name: 'Continuar: sesión de hoy (1 de 10)' }),
    ).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Riel lateral' })).toBeTruthy();
    // La ayuda de teclas no vuelve a aparecer.
    await user.click(screen.getByRole('button', { name: 'Continuar: sesión de hoy (1 de 10)' }));
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await user.keyboard('{Escape}');
    await user.click(
      await screen.findByRole('button', { name: 'Continuar: sesión de hoy (1 de 10)' }),
    );
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    expect(screen.queryByText(/^Teclas: Espacio muestra la respuesta/)).toBeNull();
  });

  it('[CA-073] escribiendo en «Tu respuesta…», Espacio y los números escriben; al salir del campo aparece «Borrador guardado» y sigue ahí al continuar', async () => {
    const { user } = withCast();
    await startSession(user);
    const field = screen.getByPlaceholderText('Tu respuesta…');
    await user.click(field);
    await user.keyboard('cuánto se alejan 2');
    expect(screen.queryByRole('button', { name: 'Con dudas' })).toBeNull();
    await user.tab();
    expect(await screen.findByText('Borrador guardado')).toBeTruthy();
    await user.keyboard('{Escape}');
    await user.click(
      await screen.findByRole('button', { name: 'Continuar: sesión de hoy (0 de 10)' }),
    );
    await waitFor(() =>
      expect((screen.getByPlaceholderText('Tu respuesta…') as HTMLTextAreaElement).value).toBe(
        'cuánto se alejan 2',
      ),
    );
    expect(screen.getByText('Borrador guardado')).toBeTruthy();
  });

  it('[CA-077] «Más» → «La tarjeta está mal» sigue con la próxima y avisa que no cuenta como olvido; Esc en el menú lo cierra sin pausar', async () => {
    const { user } = withCast();
    await startSession(user);
    await user.click(screen.getByRole('button', { name: 'Más' }));
    const menu = screen.getByRole('menu', { name: 'Más' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['La tarjeta está mal', 'Editar', 'Saltar']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('PRÁCTICA AUTÓNOMA')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Más' }));
    await user.click(screen.getByRole('menuitem', { name: 'La tarjeta está mal' }));
    await waitFor(() => expect(progress().textContent).toBe('1/10'));
    expect(screen.queryByText('¿Qué mide el desvío estándar?')).toBeNull();
    expect(
      await screen.findByText('La tarjeta pasó a «En revisión». No cuenta como olvido.'),
    ).toBeTruthy();
    expect(screen.queryByText(/^Calificaste la anterior/)).toBeNull();
  });

  it('«Más» → «Editar» abre la ficha en un panel y vuelve a la misma tarjeta con lo escrito; «Saltar» la deja para el final', async () => {
    const { user } = withCast();
    await startSession(user);
    await user.type(screen.getByPlaceholderText('Tu respuesta…'), 'algo');
    await user.click(screen.getByRole('button', { name: 'Más' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const panel = await screen.findByRole('dialog', { name: 'Editar la tarjeta' });
    await user.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    expect((screen.getByPlaceholderText('Tu respuesta…') as HTMLTextAreaElement).value).toBe(
      'algo',
    );
    await user.click(screen.getByRole('button', { name: 'Más' }));
    await user.click(screen.getByRole('menuitem', { name: 'Saltar' }));
    await waitFor(() => expect(screen.queryByText('¿Qué mide el desvío estándar?')).toBeNull());
    expect(progress().textContent).toBe('0/10');
  });

  it('[CA-074] [CA-075] [CA-076] el cierre: minutos, resultados, dificultades, próximo paso, la frase, «¿Cómo estuvo?», la duda en Progreso y «Ajustar el plan»', async () => {
    const { user, bridge } = withCast();
    await startSession(user);
    // La primera «No la sabía» (vuelve después de otras 3) y el resto «La sabía».
    await user.keyboard(' 1');
    for (let step = 0; step < 10; step += 1) {
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy(),
      );
      await user.keyboard(' 3');
    }
    expect(await screen.findByRole('heading', { name: 'Sesión terminada · 1 min' })).toBeTruthy();
    expect(screen.getByText('La sabía: 9')).toBeTruthy();
    expect(screen.getByText('Con dudas: 0')).toBeTruthy();
    expect(screen.getByText('No la sabía: 1')).toBeTruthy();
    expect(screen.getByText('Media y dispersión: ¿Qué mide el desvío estándar?')).toBeTruthy();
    expect(
      screen.getByText('Quedan 50 repasos para hoy: podés hacer otra sesión cuando quieras.'),
    ).toBeTruthy();
    expect(screen.getByText('Completar la sesión no equivale a dominar el tema')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/dominad[oa]s?/i);
    expect(
      readRows(bridge.file, "SELECT id FROM observations WHERE kind = 'session.rated'"),
    ).toHaveLength(0);
    await user.click(screen.getByRole('radio', { name: 'Justo' }));
    await waitFor(() =>
      expect(
        readRows(bridge.file, "SELECT id FROM observations WHERE kind = 'session.rated'"),
      ).toHaveLength(1),
    );

    await user.click(screen.getByRole('button', { name: 'Ajustar el plan' }));
    const adjust = await screen.findByRole('dialog', { name: 'Ajustar el plan' });
    await user.click(within(adjust).getByRole('button', { name: 'Más corto la próxima vez' }));
    expect(
      await screen.findByText(
        'Anotado. Lo voy a usar cuando Estudiar arme la propuesta por minutos.',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Guardar una duda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guardar una duda' });
    await user.type(
      within(dialog).getByLabelText('Tu duda'),
      'No entiendo por qué se divide por n−1',
    );
    expect(
      (within(dialog).getByLabelText('Sobre qué tarjeta') as HTMLSelectElement).selectedOptions[0]
        ?.textContent,
    ).toBe('¿Qué mide el desvío estándar?');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Guardé tu duda. La ves en Progreso › «Dudas y revisiones».'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Terminar' }));
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Progreso',
      }),
    );
    expect(await screen.findByText('No entiendo por qué se divide por n−1')).toBeTruthy();
    expect(screen.getByText('De la tarjeta: ¿Qué mide el desvío estándar?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dudas y revisiones' })).toBeTruthy();
  });
});
