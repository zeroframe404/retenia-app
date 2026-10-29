import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '../../../preload/contract/notes';
import { texts } from '../../../preload/contract/texts';
import { blocksToDoc } from './convert';
import styles from './editor.module.css';
import { createExtensions } from './extensions';
import { type KeyHandler, MentionMenu } from './MentionMenu';
import type { MentionSuggestionState } from './mention-plugin';

// Abre la nota en un renglón: el cursor al principio de ese renglón, desplegando lo plegado que lo
// esconde, y se lo trae a la vista. Si el renglón no existe, no hace nada.
function focusRow(view: EditorView, blockId: string) {
  let position = -1;
  view.state.doc.descendants((node, pos) => {
    if (position === -1 && node.type.name === 'listItem' && node.attrs.blockId === blockId) {
      position = pos;
    }
    return position === -1;
  });
  if (position === -1) {
    return;
  }
  const tr = view.state.tr;
  const $row = view.state.doc.resolve(position);
  for (let depth = $row.depth; depth > 0; depth -= 1) {
    const ancestor = $row.node(depth);
    if (ancestor.type.name === 'listItem' && ancestor.attrs.collapsed === true) {
      tr.setNodeMarkup($row.before(depth), undefined, { ...ancestor.attrs, collapsed: false });
    }
  }
  tr.setSelection(TextSelection.create(tr.doc, position + 2));
  // Desplegar para mostrar no es un cambio de la nota: no se guarda ni se deshace.
  tr.setMeta('preventUpdate', true).setMeta('addToHistory', false);
  view.dispatch(tr);
  view.focus();
  const element = view.nodeDOM(position);
  if (element instanceof HTMLElement) {
    element.scrollIntoView({ block: 'nearest' });
  }
}

const sameSuggestion = (a: MentionSuggestionState | null, b: MentionSuggestionState | null) =>
  a === b ||
  (a !== null && b !== null && a.from === b.from && a.to === b.to && a.query === b.query);

// El editor de la nota: los renglones con su teclado, las fórmulas, las imágenes y los enlaces a
// otras notas.
export function RowsEditor({
  blocks,
  focusBlockId,
  onReady,
  onDocChange,
  onOpenNote,
  onImageError,
}: {
  blocks: readonly Block[];
  focusBlockId: string | null;
  // El documento con el que arranca el editor, antes de que cambie nada.
  onReady: (doc: ProseMirrorNode) => void;
  // Cada vez que cambia lo escrito.
  onDocChange: (doc: ProseMirrorNode) => void;
  onOpenNote: (noteId: string) => void;
  onImageError: () => void;
}) {
  const [suggestion, setSuggestion] = useState<MentionSuggestionState | null>(null);
  const keyHandler: KeyHandler = useRef(null);
  const latest = useRef({ onReady, onDocChange, onOpenNote, onImageError });
  latest.current = { onReady, onDocChange, onOpenNote, onImageError };

  const extensions = useMemo(
    () =>
      createExtensions({
        onOpenNote: (noteId) => latest.current.onOpenNote(noteId),
        onImageError: () => latest.current.onImageError(),
        suggestion: {
          onChange: (next) =>
            setSuggestion((previous) => (sameSuggestion(previous, next) ? previous : next)),
          onKeyDown: (event) => keyHandler.current?.(event) ?? false,
        },
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: blocksToDoc(blocks),
    editorProps: {
      attributes: {
        class: styles.editor ?? '',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': texts.notes.editor.contentLabel,
      },
    },
    onUpdate: ({ editor: current }) => latest.current.onDocChange(current.state.doc),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir la nota; para cambiar de nota la pantalla se vuelve a montar
  useEffect(() => {
    if (!editor) {
      return;
    }
    latest.current.onReady(editor.state.doc);
    if (focusBlockId !== null) {
      focusRow(editor.view, focusBlockId);
    }
  }, [editor]);

  return (
    <div className={styles.host}>
      <EditorContent editor={editor} />
      {editor && suggestion ? (
        <MentionMenu view={editor.view} suggestion={suggestion} keyHandler={keyHandler} />
      ) : null}
    </div>
  );
}
