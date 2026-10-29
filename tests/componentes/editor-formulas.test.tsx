import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS } from '../../src/preload/contract/notes';
import {
  contentEditor,
  contentElement,
  installApi,
  note,
  putCursor,
  renderNote,
  row,
  rowId,
  typeText,
} from './editor-apoyo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const SOURCE = String.raw`$\bar{x} \pm t \cdot s/\sqrt{n}$`;

const rendered = () => contentElement().querySelectorAll('[data-formula="rendered"] .katex');
const hiddenSource = () => contentElement().querySelectorAll('[data-formula="source-hidden"]');

function noteWithFormula(source = SOURCE) {
  return note('Fórmulas', [row(1, 'Primero'), row(2, `Intervalo: ${source} para la media`)]);
}

describe('[CA-373] fórmulas entre signos $ con el estilo de un libro, sin internet', () => {
  beforeEach(() => {
    installApi();
  });

  it('[CA-373] con el cursor en otro renglón la fórmula se dibuja con KaTeX y el texto fuente queda oculto', () => {
    renderNote(noteWithFormula());
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(1);
    expect(hiddenSource()).toHaveLength(1);
    expect(hiddenSource()[0]?.textContent).toBe(SOURCE);
  });

  it('[CA-373] la fórmula dibujada trae su versión en MathML para el lector de pantalla', () => {
    renderNote(noteWithFormula());
    putCursor(contentEditor(), rowId(1));
    expect(
      contentElement().querySelector('[data-formula="rendered"] .katex-mathml math'),
    ).not.toBeNull();
    expect(contentElement().querySelector('[data-formula="rendered"] .katex-html')).not.toBeNull();
  });

  it('[CA-373] con el cursor adentro de la fórmula se ve el texto original para editarlo', () => {
    renderNote(noteWithFormula());
    const editor = contentEditor();
    putCursor(editor, rowId(2), 'Intervalo: '.length + 5);
    expect(rendered()).toHaveLength(0);
    expect(hiddenSource()).toHaveLength(0);
    expect(contentElement().textContent).toContain(SOURCE);
  });

  it('[CA-373] con el cursor pegado a un borde de la fórmula también se ve el texto original', () => {
    renderNote(noteWithFormula());
    const editor = contentEditor();
    putCursor(editor, rowId(2), 'Intervalo: '.length);
    expect(rendered()).toHaveLength(0);
    putCursor(editor, rowId(2), 'Intervalo: '.length + SOURCE.length);
    expect(rendered()).toHaveLength(0);
  });

  it('[CA-373] al salir del tramo con el cursor la fórmula vuelve a dibujarse', () => {
    renderNote(noteWithFormula());
    const editor = contentEditor();
    putCursor(editor, rowId(2), 'Intervalo: '.length + 3);
    expect(rendered()).toHaveLength(0);
    putCursor(editor, rowId(1));
    expect(rendered()).toHaveLength(1);
  });

  it('[CA-373] una selección que toca la fórmula la muestra como texto', () => {
    renderNote(noteWithFormula());
    const editor = contentEditor();
    putCursor(editor, rowId(2));
    act(() => {
      editor.commands.selectAll();
    });
    expect(rendered()).toHaveLength(0);
  });

  it('[CA-373] al escribir el signo que cierra la fórmula y salir del renglón se dibuja', () => {
    renderNote(note('Nueva', [row(1, ''), row(2, 'Otro')]));
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    typeText(editor, '$x^2$');
    expect(rendered()).toHaveLength(0);
    putCursor(editor, rowId(2));
    expect(rendered()).toHaveLength(1);
  });

  it('[CA-373] varias fórmulas del mismo renglón se dibujan cada una', () => {
    renderNote(note('Dos', [row(1, 'Uno'), row(2, '$a^2$ más $b^2$')]));
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(2);
  });

  it('[CA-373] una fórmula inválida se ve como el texto original y no rompe nada', () => {
    renderNote(
      note('Rota', [row(1, 'Uno'), row(2, String.raw`mal: $\comandoquenoexiste$ y $\frac{1}{$`)]),
    );
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(0);
    expect(hiddenSource()).toHaveLength(0);
    expect(contentElement().textContent).toContain(String.raw`$\comandoquenoexiste$`);
  });

  it('[CA-373] una fórmula inválida y otra válida en el mismo renglón: la válida se dibuja', () => {
    renderNote(note('Mixta', [row(1, 'Uno'), row(2, String.raw`$\comandoquenoexiste$ y $x^2$`)]));
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(1);
  });

  it('[CA-373] un precio en pesos no se toma por una fórmula', () => {
    renderNote(note('Precios', [row(1, 'Uno'), row(2, 'Pagué $500 y después $300')]));
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(0);
    expect(contentElement().textContent).toContain('Pagué $500 y después $300');
  });

  it('[CA-373] dibujar la fórmula no usa internet', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    renderNote(noteWithFormula());
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('[CA-373] la nota guarda el texto original entre $, no el dibujo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = installApi();
    renderNote(noteWithFormula());
    const editor = contentEditor();
    putCursor(editor, rowId(1));
    expect(rendered()).toHaveLength(1);
    typeText(editor, ' más');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    const blocks = api.save.mock.calls[0]?.[0].blocks;
    expect(blocks?.[1]?.content).toEqual([
      { type: 'text', text: `Intervalo: ${SOURCE} para la media` },
    ]);
  });

  it('[CA-373] el texto fuente sigue siendo texto de la nota mientras la fórmula está dibujada', () => {
    renderNote(noteWithFormula());
    putCursor(contentEditor(), rowId(1));
    expect(rendered()).toHaveLength(1);
    expect(contentEditor().state.doc.textContent).toContain(SOURCE);
  });
});
