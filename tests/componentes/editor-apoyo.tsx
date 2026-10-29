import { act, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { vi } from 'vitest';
import type { ReteniaApi } from '../../src/preload/contract';
import type { Block, InlineNode, Note } from '../../src/preload/contract/notes';
import { NoteEditor } from '../../src/renderer/notes/NoteEditor';

// Lo que usan las pruebas del editor: la ventana falsa (una frontera: el puente real no hace
// falta para probar el editor), los renglones de prueba y atajos para mirar y mover el editor.

// jsdom no mide pantalla: ProseMirror pide rectángulos, el punto bajo el mouse y mover la vista.
const emptyRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  toJSON: () => ({}),
};
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect;
}
if (typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
export const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

export const uuid = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
export const NOTE_ID = uuid(1);
export const rowId = (n: number) => uuid(100 + n);
export const SHA_A = 'a'.repeat(64);
export const SHA_B = 'b'.repeat(64);
// Un PNG de 1×1 píxel.
export const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

export function row(
  n: number,
  text: string,
  options: { parent?: number; collapsed?: boolean; content?: InlineNode[] } = {},
): Block {
  return {
    id: rowId(n),
    parentId: options.parent === undefined ? null : rowId(options.parent),
    collapsed: options.collapsed ?? false,
    content: options.content ?? (text === '' ? [] : [{ type: 'text', text }]),
  };
}

export function note(title: string, blocks: Block[], id = NOTE_ID): Note {
  return { id, subjectId: uuid(2), topicId: null, title, archived: false, blocks };
}

export function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type Channel = 'notes.save' | 'notes.titles' | 'notes.mentions' | 'images.save' | 'images.read';

// window.retenia con solo los canales del editor, todos con un comportamiento por defecto que
// cada prueba cambia a su gusto.
export function installApi() {
  const api = {
    save: vi.fn<ReteniaApi['notes.save']>(async () => ({})),
    titles: vi.fn<ReteniaApi['notes.titles']>(async () => ({ notes: [] })),
    mentions: vi.fn<ReteniaApi['notes.mentions']>(async () => ({ mentions: [] })),
    saveImage: vi.fn<ReteniaApi['images.save']>(async () => ({ sha: SHA_A })),
    readImage: vi.fn<ReteniaApi['images.read']>(async () => ({ mime: 'image/png', bytes: PNG })),
  };
  const bridge: Pick<ReteniaApi, Channel> = {
    'notes.save': api.save,
    'notes.titles': api.titles,
    'notes.mentions': api.mentions,
    'images.save': api.saveImage,
    'images.read': api.readImage,
  };
  window.retenia = bridge as unknown as ReteniaApi;
  return api;
}

export function renderNote(
  noteToOpen: Note,
  props: { focusBlockId?: string | null; autoFocusTitle?: boolean } = {},
) {
  scrollIntoView.mockClear();
  const onBack = vi.fn();
  const onOpenNote = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <NoteEditor
      note={noteToOpen}
      onBack={onBack}
      onOpenNote={onOpenNote}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { ...view, onBack, onOpenNote, onSaved };
}

export const CONTENT_LABEL = 'Contenido de la nota';

export function contentElement(): HTMLElement & { editor: Editor } {
  return screen.getByRole('textbox', { name: CONTENT_LABEL }) as HTMLElement & { editor: Editor };
}

export function contentEditor(): Editor {
  return contentElement().editor;
}

// Todo lo que cambia el editor pasa por act, como lo que hace una persona.
export function run(action: () => void) {
  act(() => {
    action();
  });
}

export function typeText(editor: Editor, text: string) {
  run(() => {
    editor.view.dispatch(editor.state.tr.insertText(text));
  });
}

// Una tecla apretada con el editor enfocado: el mismo camino que sigue el teclado de verdad.
export function pressKey(editor: Editor, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  run(() => {
    editor.view.dom.dispatchEvent(event);
  });
  return event;
}

function positionOf(editor: Editor, blockId: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'listItem' && node.attrs.blockId === blockId) {
      found = pos;
    }
    return found === -1;
  });
  if (found === -1) {
    throw new Error(`no hay un renglón ${blockId}`);
  }
  return found;
}

// El cursor adentro del renglón, a tantos caracteres de su principio.
export function putCursor(editor: Editor, blockId: string, offset = 0) {
  const position = positionOf(editor, blockId) + 2 + offset;
  run(() => {
    editor.commands.setTextSelection(position);
  });
}

export function putCursorAtEnd(editor: Editor, blockId: string) {
  const item = editor.state.doc.nodeAt(positionOf(editor, blockId));
  putCursor(editor, blockId, item?.firstChild?.content.size ?? 0);
}

function listText(list: ProseMirrorNode): string {
  const items: string[] = [];
  list.forEach((item) => {
    const nested = item.childCount > 1 ? `[${listText(item.child(1))}]` : '';
    items.push(`${item.child(0).textContent}${nested}`);
  });
  return items.join(',');
}

// Los renglones como texto: «Uno[Dos],Tres» es «Dos» adentro de «Uno» y «Tres» al lado.
export function outline(editor: Editor): string {
  return listText(editor.state.doc.child(0));
}

export function blockIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'listItem') {
      ids.push(node.attrs.blockId as string);
    }
  });
  return ids;
}
