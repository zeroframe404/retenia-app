import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { zoomDirection } from '../../src/renderer/shortcuts';
import { Dialog } from '../../src/renderer/ui/Frame';

// Las teclas del zoom y el cuadro (diálogo): lo que no se ve en una pantalla armada.

afterEach(() => {
  cleanup();
  document.getElementById('raiz')?.remove();
});

describe('teclas del zoom (con Ctrl)', () => {
  it.for([
    ['+', 'in'],
    ['=', 'in'],
    ['-', 'out'],
    ['_', 'out'],
    ['0', 'reset'],
  ] as const)('[CA-035] la tecla «%s» es «%s»', ([key, direction]) => {
    expect(zoomDirection(key)).toBe(direction);
  });

  it.for(['1', '6', '9', 'k', 'K', 'a', 'Enter', 'Tab', ')', '~', ''])(
    '[CA-035] la tecla «%s» no toca el zoom (Ctrl y 1 a Ctrl y 6 son los atajos del riel)',
    (key) => {
      expect(zoomDirection(key)).toBeNull();
    },
  );
});

function Harness({ gone = false }: { gone?: boolean }) {
  const [open, setOpen] = useState(false);
  const [exists, setExists] = useState(true);
  return (
    <>
      {exists ? (
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
      ) : null}
      {open ? (
        <Dialog
          title="Cuadro"
          onClose={() => {
            if (gone) {
              setExists(false);
            }
            setOpen(false);
          }}
        >
          <p>Adentro</p>
        </Dialog>
      ) : null}
    </>
  );
}

describe('el cuadro (diálogo)', () => {
  function withRoot() {
    const root = document.createElement('div');
    root.id = 'raiz';
    document.body.append(root);
    return root;
  }

  it('[CA-034] deja inerte todo lo demás mientras está abierto y lo devuelve al cerrarse', async () => {
    const root = withRoot();
    const user = userEvent.setup();
    render(<Harness />, { container: root.appendChild(document.createElement('div')) });
    expect(root.hasAttribute('inert')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cuadro' });
    expect(root.hasAttribute('inert')).toBe(true);
    // El cuadro está afuera de la raíz inerte: sigue siendo alcanzable.
    expect(root.contains(dialog)).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
  });

  it('[CA-034] al cerrarse devuelve el foco a lo que lo abrió', async () => {
    withRoot();
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Cuadro' });
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });

  it('[CA-034] si lo que lo abrió ya no existe, cerrarse no falla ni deja la raíz inerte', async () => {
    const root = withRoot();
    const user = userEvent.setup();
    render(<Harness gone />, { container: root.appendChild(document.createElement('div')) });
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await screen.findByRole('dialog', { name: 'Cuadro' });
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
  });
});
