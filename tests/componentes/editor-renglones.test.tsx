import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockIds,
  contentEditor,
  contentElement,
  installApi,
  note,
  outline,
  pressKey,
  putCursor,
  putCursorAtEnd,
  renderNote,
  row,
  rowId,
  run,
  scrollIntoView,
  typeText,
} from './editor-apoyo';

beforeEach(() => {
  installApi();
});
afterEach(() => {
  cleanup();
});

const ctrl = { ctrlKey: true };
const altShift = { altKey: true, shiftKey: true };

function threeRows() {
  return note('Orden', [row(1, 'Uno'), row(2, 'Dos'), row(3, 'Tres')]);
}

describe('editor · el documento por renglones', () => {
  it('es un cuadro de texto de varias líneas con el nombre «Contenido de la nota»', async () => {
    await renderNote(threeRows());
    const editor = contentElement();
    expect(editor.getAttribute('aria-multiline')).toBe('true');
    expect(editor.getAttribute('contenteditable')).toBe('true');
  });

  it('muestra un renglón por cada uno de la nota, con los hijos adentro del padre', async () => {
    await renderNote(
      note('Con hijos', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 }), row(3, 'Tres')]),
    );
    expect(outline(contentEditor())).toBe('Uno[Dos],Tres');
    expect(blockIds(contentEditor())).toEqual([rowId(1), rowId(2), rowId(3)]);
    expect(within(contentElement()).getAllByRole('listitem')).toHaveLength(3);
  });

  it('no tiene formato ni títulos ni saltos forzados: solo renglones, enlaces e imágenes', async () => {
    await renderNote(threeRows());
    const { schema } = contentEditor();
    expect(Object.keys(schema.nodes).sort()).toEqual([
      'bulletList',
      'doc',
      'image',
      'listItem',
      'mention',
      'paragraph',
      'text',
    ]);
    expect(Object.keys(schema.marks)).toEqual([]);
  });

  it('Ctrl+B no pone negrita ni cambia nada', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(1), 1);
    const before = JSON.stringify(editor.getJSON());
    pressKey(editor, 'b', ctrl);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it('Ctrl+Z deshace lo escrito y Ctrl+Y lo rehace', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursorAtEnd(editor, rowId(1));
    typeText(editor, ' y más');
    expect(outline(editor)).toBe('Uno y más,Dos,Tres');
    pressKey(editor, 'z', ctrl);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
    pressKey(editor, 'y', ctrl);
    expect(outline(editor)).toBe('Uno y más,Dos,Tres');
  });

  it('nunca escribe un atributo style con setAttribute: la política de contenido de la ventana los descarta', async () => {
    const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
    try {
      await renderNote(
        note('Plegada', [
          row(1, 'Uno', { content: [{ type: 'mention', id: rowId(50), label: 'Otra' }] }),
          row(2, 'Dos', { parent: 1 }),
        ]),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Plegar' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Desplegar' }));
      await screen.findByRole('button', { name: 'Plegar' });
      const styled = setAttribute.mock.calls.filter(([name]) => name.toLowerCase() === 'style');
      expect(styled).toEqual([]);
    } finally {
      setAttribute.mockRestore();
    }
  });

  it('los renglones son arrastrables y cada uno tiene su asa «Mover el renglón», fuera del orden de Tab', async () => {
    await renderNote(threeRows());
    expect(contentEditor().schema.nodes.listItem?.spec.draggable).toBe(true);
    const rows = within(contentElement()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    for (const item of rows) {
      const handle = within(item).getByRole('button', { name: 'Mover el renglón' });
      expect(handle.hasAttribute('data-drag-handle')).toBe(true);
      expect(handle.getAttribute('draggable')).toBe('true');
      expect(handle.getAttribute('tabindex')).toBe('-1');
    }
  });
});

describe('editor · identificadores de renglón', () => {
  it('al partir un renglón con Enter, el que queda arriba conserva su identificador y el nuevo recibe otro', async () => {
    await renderNote(note('Partir', [row(1, 'Uno'), row(2, 'Dos')]));
    const editor = contentEditor();
    putCursor(editor, rowId(1), 1);
    pressKey(editor, 'Enter');
    expect(outline(editor)).toBe('U,no,Dos');
    const ids = blockIds(editor);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(rowId(1));
    expect(ids[2]).toBe(rowId(2));
    expect(ids[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('al pegar un renglón con un identificador repetido, el repetido recibe uno nuevo y el primero conserva el suyo', async () => {
    await renderNote(note('Pegar', [row(1, 'Uno'), row(2, 'Dos')]));
    const editor = contentEditor();
    const end = editor.state.doc.child(0).nodeSize - 1;
    run(() => {
      editor.commands.insertContentAt(end, {
        type: 'listItem',
        attrs: { blockId: rowId(1), collapsed: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Copia' }] }],
      });
    });
    expect(outline(editor)).toContain('Copia');
    const ids = blockIds(editor);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(rowId(1));
    expect(ids[1]).toBe(rowId(2));
  });

  it('un renglón que llega sin identificador recibe uno', async () => {
    await renderNote(note('Sin id', [row(1, 'Uno')]));
    const editor = contentEditor();
    const end = editor.state.doc.child(0).nodeSize - 1;
    run(() => {
      editor.commands.insertContentAt(end, {
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nuevo' }] }],
      });
    });
    const ids = blockIds(editor);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => typeof id === 'string' && id.length === 36)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(rowId(1));
  });
});

describe('editor · Tab, Mayús+Tab, mover y plegar con el teclado', () => {
  it('[CA-042] Tab mete el renglón adentro del anterior y Mayús+Tab lo saca a su lugar', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(2), 1);
    const sink = pressKey(editor, 'Tab');
    expect(sink.defaultPrevented).toBe(true);
    expect(outline(editor)).toBe('Uno[Dos],Tres');
    const lift = pressKey(editor, 'Tab', { shiftKey: true });
    expect(lift.defaultPrevented).toBe(true);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
  });

  it('[CA-042] al anidar, los hijos del renglón van con él y el cursor se queda donde estaba', async () => {
    await renderNote(
      note('Con hijos', [row(1, 'Uno'), row(2, 'Dos'), row(3, 'Tres', { parent: 2 })]),
    );
    const editor = contentEditor();
    putCursor(editor, rowId(2), 2);
    pressKey(editor, 'Tab');
    expect(outline(editor)).toBe('Uno[Dos[Tres]]');
    expect(editor.state.selection.$from.parent.textContent).toBe('Dos');
    expect(editor.state.selection.$from.parentOffset).toBe(2);
  });

  it('[CA-042] con Tab en el primer renglón no se consume la tecla: el foco sigue su camino', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    const event = pressKey(editor, 'Tab');
    expect(event.defaultPrevented).toBe(false);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
  });

  it('[CA-042] con Mayús+Tab en un renglón que no está anidado no se consume la tecla', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    const event = pressKey(editor, 'Tab', { shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
  });

  it('Enter en un renglón vacío y anidado lo saca a su lugar', async () => {
    await renderNote(
      note('Anidados', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 }), row(3, '', { parent: 1 })]),
    );
    const editor = contentEditor();
    putCursor(editor, rowId(3));
    pressKey(editor, 'Enter');
    expect(outline(editor)).toBe('Uno[Dos],');
  });

  it('Enter al final de un renglón con hijos abiertos crea el primero de sus hijos', async () => {
    await renderNote(note('Con hijos', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 })]));
    const editor = contentEditor();
    putCursorAtEnd(editor, rowId(1));
    pressKey(editor, 'Enter');
    expect(outline(editor)).toBe('Uno[,Dos]');
    expect(editor.state.selection.$from.parent.textContent).toBe('');
    expect(blockIds(editor)[0]).toBe(rowId(1));
    expect(blockIds(editor)[2]).toBe(rowId(2));
  });

  it('Enter en un renglón vacío de primer nivel deja otro renglón vacío debajo', async () => {
    await renderNote(note('Vacío', [row(1, 'Uno'), row(2, '')]));
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    pressKey(editor, 'Enter');
    expect(outline(editor)).toBe('Uno,,');
  });

  it('Retroceso al principio de un renglón de primer nivel pasa su texto al final del de arriba', async () => {
    await renderNote(note('Juntar', [row(1, 'Uno'), row(2, 'Dos')]));
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    expect(pressKey(editor, 'Backspace').defaultPrevented).toBe(true);
    expect(outline(editor)).toBe('UnoDos');
    expect(blockIds(editor)).toEqual([rowId(1)]);
    expect(editor.state.selection.$from.parentOffset).toBe(3);
  });

  it('Retroceso al principio de un renglón de primer nivel se junta con el último hijo abierto del de arriba', async () => {
    await renderNote(note('Juntar', [row(1, 'Uno'), row(2, 'Hijo', { parent: 1 }), row(3, 'Dos')]));
    const editor = contentEditor();
    putCursor(editor, rowId(3));
    pressKey(editor, 'Backspace');
    expect(outline(editor)).toBe('Uno[HijoDos]');
    expect(editor.state.selection.$from.parentOffset).toBe(4);
  });

  it('Retroceso al principio de un renglón con hijos junta el texto y los hijos pasan con él', async () => {
    await renderNote(note('Juntar', [row(1, 'Uno'), row(2, 'Dos'), row(3, 'Tres', { parent: 2 })]));
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    pressKey(editor, 'Backspace');
    expect(outline(editor)).toBe('UnoDos[Tres]');
    expect(blockIds(editor)).toEqual([rowId(1), rowId(3)]);
  });

  it('Retroceso al principio del primer renglón no cambia nada', async () => {
    await renderNote(note('Juntar', [row(1, 'Uno'), row(2, 'Dos')]));
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    pressKey(editor, 'Backspace');
    expect(outline(editor)).toBe('Uno,Dos');
  });

  it('Retroceso al principio de un renglón anidado lo saca a su lugar', async () => {
    await renderNote(note('Anidados', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 })]));
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    expect(pressKey(editor, 'Backspace').defaultPrevented).toBe(true);
    expect(outline(editor)).toBe('Uno,Dos');
  });

  it('Alt+Mayús+↑ sube el renglón entre sus hermanos y Alt+Mayús+↓ lo baja', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(3), 2);
    expect(pressKey(editor, 'ArrowUp', altShift).defaultPrevented).toBe(true);
    expect(outline(editor)).toBe('Uno,Tres,Dos');
    expect(editor.state.selection.$from.parent.textContent).toBe('Tres');
    expect(editor.state.selection.$from.parentOffset).toBe(2);
    pressKey(editor, 'ArrowDown', altShift);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
    expect(blockIds(editor)).toEqual([rowId(1), rowId(2), rowId(3)]);
  });

  it('mover un renglón se lleva a sus hijos', async () => {
    await renderNote(
      note('Con hijos', [row(1, 'Uno'), row(2, 'Dos'), row(3, 'Tres', { parent: 2 })]),
    );
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    pressKey(editor, 'ArrowUp', altShift);
    expect(outline(editor)).toBe('Dos[Tres],Uno');
  });

  it('el primer renglón no sube y el último no baja: la tecla no se consume', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    expect(pressKey(editor, 'ArrowUp', altShift).defaultPrevented).toBe(false);
    putCursor(editor, rowId(3));
    expect(pressKey(editor, 'ArrowDown', altShift).defaultPrevented).toBe(false);
    expect(outline(editor)).toBe('Uno,Dos,Tres');
  });

  it('Ctrl+↑ pliega el renglón que tiene hijos y Ctrl+↓ lo despliega', async () => {
    await renderNote(note('Plegar', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 })]));
    const editor = contentEditor();
    const item = () => contentElement().querySelector(`[data-block-id="${rowId(1)}"]`);
    putCursor(editor, rowId(1));
    expect(pressKey(editor, 'ArrowUp', ctrl).defaultPrevented).toBe(true);
    expect(item()?.getAttribute('data-collapsed')).toBe('true');
    expect(pressKey(editor, 'ArrowDown', ctrl).defaultPrevented).toBe(true);
    expect(item()?.getAttribute('data-collapsed')).toBe('false');
  });

  it('Ctrl+↑ en un renglón sin hijos no hace nada y no se consume', async () => {
    await renderNote(threeRows());
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    expect(pressKey(editor, 'ArrowUp', ctrl).defaultPrevented).toBe(false);
  });

  it('el botón de plegar solo está en los renglones con hijos, dice su estado y queda fuera del orden de Tab', async () => {
    await renderNote(note('Plegar', [row(1, 'Uno'), row(2, 'Dos', { parent: 1 }), row(3, 'Tres')]));
    expect(screen.getAllByRole('button', { name: 'Plegar' })).toHaveLength(1);
    const fold = screen.getByRole('button', { name: 'Plegar' });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(fold.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(fold);
    const unfold = await screen.findByRole('button', { name: 'Desplegar' });
    expect(unfold.getAttribute('aria-expanded')).toBe('false');
    expect(
      contentElement()
        .querySelector(`[data-block-id="${rowId(1)}"]`)
        ?.getAttribute('data-collapsed'),
    ).toBe('true');
    fireEvent.click(unfold);
    const again = await screen.findByRole('button', { name: 'Plegar' });
    expect(again.getAttribute('aria-expanded')).toBe('true');
  });

  it('si el cursor queda adentro de lo plegado, pasa al final del renglón que lo pliega', async () => {
    await renderNote(
      note('Plegada', [row(1, 'Uno', { collapsed: true }), row(2, 'Dos', { parent: 1 })]),
    );
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    expect(editor.state.selection.$from.parent.textContent).toBe('Uno');
    expect(editor.state.selection.$from.parentOffset).toBe(3);
  });
});

describe('editor · la pantalla de la nota', () => {
  it('tiene el título de la nota como encabezado, el campo «Título» y «Volver a las notas»', async () => {
    await renderNote(note('Regresión lineal', [row(1, 'Uno')]));
    expect(screen.getByRole('heading', { level: 3, name: 'Regresión lineal' })).toBeTruthy();
    const title = screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement;
    expect(title.value).toBe('Regresión lineal');
    expect(screen.getByRole('button', { name: 'Volver a las notas' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Mencionada en' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('una nota sin título se llama «Sin título» en el encabezado y en el campo vacío', async () => {
    await renderNote(note('', [row(1, 'Uno')]));
    expect(screen.getByRole('heading', { level: 3, name: 'Sin título' })).toBeTruthy();
    const title = screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement;
    expect(title.value).toBe('');
    expect(title.getAttribute('placeholder')).toBe('Sin título');
  });

  it('tiene exactamente un botón primario', async () => {
    const { container } = await renderNote(threeRows());
    expect(container.querySelectorAll('[data-button="primary"]')).toHaveLength(1);
  });
});

describe('editor · abrir en un renglón y accesibilidad', () => {
  it('[CA-375] con «focusBlockId» el cursor va al principio de ese renglón y se lo trae a la vista', async () => {
    await renderNote(threeRows(), { focusBlockId: rowId(2) });
    const { selection } = contentEditor().state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.textContent).toBe('Dos');
    expect(selection.$from.parentOffset).toBe(0);
    const target = contentElement().querySelector(`[data-block-id="${rowId(2)}"]`);
    expect(scrollIntoView.mock.contexts).toContain(target);
  });

  it('si el renglón no existe se ignora: no falla ni mueve nada', async () => {
    await renderNote(threeRows(), { focusBlockId: rowId(99) });
    expect(outline(contentEditor())).toBe('Uno,Dos,Tres');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('un renglón escondido en uno plegado se despliega para mostrarlo, sin dejar nada para guardar', async () => {
    await renderNote(
      note('Plegada', [row(1, 'Uno', { collapsed: true }), row(2, 'Dos', { parent: 1 })]),
      {
        focusBlockId: rowId(2),
      },
    );
    expect(contentEditor().state.selection.$from.parent.textContent).toBe('Dos');
    expect(
      contentElement()
        .querySelector(`[data-block-id="${rowId(1)}"]`)
        ?.getAttribute('data-collapsed'),
    ).toBe('false');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('con «autoFocusTitle» el foco empieza en el título', async () => {
    await renderNote(note('', [row(1, '')]), { autoFocusTitle: true });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Título' }));
  });

  it('el editor, con renglones anidados, plegados y con enlaces, no tiene faltas de accesibilidad según axe-core', async () => {
    const { container } = await renderNote(
      note('Accesible', [
        row(1, 'Uno', { collapsed: true }),
        row(2, 'Dos', { parent: 1 }),
        row(3, 'Tres', {
          content: [
            { type: 'text', text: 'Mirá ' },
            { type: 'mention', id: rowId(50), label: 'Media y desvío' },
          ],
        }),
      ]),
    );
    const outcome = await axe.run(container, {
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(outcome.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
