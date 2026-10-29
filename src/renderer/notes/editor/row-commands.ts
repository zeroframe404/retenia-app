import type { NodeType, Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { liftListItem, sinkListItem, splitListItem } from '@tiptap/pm/schema-list';
import { type Command, type EditorState, TextSelection } from '@tiptap/pm/state';

// Los comandos del teclado sobre los renglones. Un renglón es un `listItem` con su párrafo y,
// opcional, la lista de sus hijos. Cada comando devuelve falso cuando no tiene nada que hacer:
// así la tecla no se consume y el navegador sigue con lo suyo (Tab, por ejemplo, mueve el foco).

// El renglón donde está el cursor: su profundidad en el documento (0 si no hay).
function rowDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'listItem') {
      return depth;
    }
  }
  return 0;
}

// El párrafo de un renglón de primer nivel: doc > lista > renglón > párrafo es profundidad 3.
const TOP_LEVEL_PARAGRAPH_DEPTH = 3;

export function sinkRow(type: NodeType): Command {
  return sinkListItem(type);
}

export function liftRow(type: NodeType): Command {
  const lift = liftListItem(type);
  return (state, dispatch) => {
    const depth = rowDepth(state.selection.$from);
    // Un renglón que no está adentro de otro no tiene adónde salir.
    if (depth <= 2) {
      return false;
    }
    return lift(state, dispatch);
  };
}

function emptyRow(type: NodeType): ProseMirrorNode | null {
  return type.createAndFill();
}

// Enter: parte el renglón. Con el cursor al final de uno que tiene hijos abiertos, el renglón nuevo
// es el primero de sus hijos. En uno vacío y anidado, lo saca a su lugar; en uno vacío de primer
// nivel, deja otro renglón vacío debajo.
export function splitRow(type: NodeType): Command {
  const split = splitListItem(type);
  const lift = liftRow(type);
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    const depth = rowDepth($from);
    if (depth === 0 || $from.parent.type.name !== 'paragraph') {
      return false;
    }
    if (!empty) {
      return split(state, dispatch);
    }
    const item = $from.node(depth);
    const atEnd = $from.parentOffset === $from.parent.content.size;
    const nested = item.childCount > 1 ? item.child(1) : null;

    if (
      atEnd &&
      nested !== null &&
      item.attrs.collapsed !== true &&
      $from.parent.content.size > 0
    ) {
      const created = emptyRow(type);
      if (created === null) {
        return false;
      }
      if (dispatch) {
        const at = $from.after() + 1;
        const tr = state.tr.insert(at, created);
        tr.setSelection(TextSelection.create(tr.doc, at + 2));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (split(state, dispatch)) {
      return true;
    }
    if ($from.depth > TOP_LEVEL_PARAGRAPH_DEPTH) {
      return lift(state, dispatch);
    }
    const created = emptyRow(type);
    if (created === null || $from.parent.content.size > 0) {
      return false;
    }
    if (dispatch) {
      const at = $from.after(depth);
      const tr = state.tr.insert(at, created);
      tr.setSelection(TextSelection.create(tr.doc, at + 2));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Retroceso al principio de un renglón. Si está anidado, lo saca a su lugar. Si es de primer nivel y
// no tiene hijos, su texto pasa al final del renglón de arriba que se ve (el último de sus hijos
// abiertos, si los tiene). Lo demás lo resuelve Tiptap como siempre.
export function backspaceRow(type: NodeType): Command {
  const lift = liftRow(type);
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph') {
      return false;
    }
    if ($from.depth > TOP_LEVEL_PARAGRAPH_DEPTH) {
      return lift(state, dispatch);
    }
    const depth = rowDepth($from);
    const item = $from.node(depth);
    const index = $from.index(depth - 1);
    if (index === 0) {
      return false;
    }
    const start = $from.before(depth);
    let target = $from.node(depth - 1).child(index - 1);
    let targetPos = start - target.nodeSize;
    while (target.childCount > 1 && target.attrs.collapsed !== true) {
      const nested = target.child(1);
      const last = nested.child(nested.childCount - 1);
      targetPos += 1 + target.child(0).nodeSize + 1 + nested.content.size - last.nodeSize;
      target = last;
    }
    if (dispatch) {
      const paragraphEnd = targetPos + 2 + target.child(0).content.size;
      const tr = state.tr.delete(start, start + item.nodeSize);
      // Sus hijos pasan con él: al final de los del renglón de arriba o, si no tiene, como su lista.
      const children = item.childCount > 1 ? item.child(1) : null;
      if (children !== null) {
        const above = target.childCount > 1 ? target.child(1) : null;
        if (above === null) {
          tr.insert(paragraphEnd + 1, children);
        } else {
          tr.insert(paragraphEnd + 1 + above.content.size + 1, children.content);
        }
      }
      const joinAt = paragraphEnd;
      tr.insert(joinAt, item.child(0).content);
      tr.setSelection(TextSelection.create(tr.doc, joinAt));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Alt+Mayús+↑ y ↓: el renglón (con sus hijos) cambia de lugar con el hermano de arriba o de abajo.
export function moveRow(direction: 'up' | 'down'): Command {
  return (state, dispatch) => {
    const { $from, from, to } = state.selection;
    const depth = rowDepth($from);
    if (depth === 0) {
      return false;
    }
    const item = $from.node(depth);
    const list = $from.node(depth - 1);
    const index = $from.index(depth - 1);
    const start = $from.before(depth);
    const end = start + item.nodeSize;
    // El cursor (o la selección, si cabe en el renglón) acompaña al renglón.
    const offset = from - start;
    const length = to <= end ? to - from : 0;

    if (direction === 'up') {
      if (index === 0) {
        return false;
      }
      const target = start - list.child(index - 1).nodeSize;
      if (dispatch) {
        const tr = state.tr.delete(start, end).insert(target, item);
        tr.setSelection(TextSelection.create(tr.doc, target + offset, target + offset + length));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (index === list.childCount - 1) {
      return false;
    }
    const target = start + list.child(index + 1).nodeSize;
    if (dispatch) {
      const tr = state.tr.delete(start, end).insert(target, item);
      tr.setSelection(TextSelection.create(tr.doc, target + offset, target + offset + length));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// Ctrl+↑ pliega el renglón actual si tiene hijos y Ctrl+↓ lo despliega.
export function foldRow(collapse: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = rowDepth($from);
    if (depth === 0) {
      return false;
    }
    const item = $from.node(depth);
    const collapsed = item.attrs.collapsed === true;
    if (collapsed === collapse || (collapse && item.childCount < 2)) {
      return false;
    }
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup($from.before(depth), undefined, {
          ...item.attrs,
          collapsed: collapse,
        }),
      );
    }
    return true;
  };
}

// Si el cursor quedó adentro de un renglón plegado (por plegarlo o por moverse con las flechas),
// pasa al final del renglón que lo pliega: el cursor no puede estar donde no se ve.
export function selectionOutOfFolded(state: EditorState): TextSelection | null {
  const { $from } = state.selection;
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth);
    if (node.type.name === 'listItem' && node.attrs.collapsed === true && $from.index(depth) >= 1) {
      const paragraph = node.child(0);
      return TextSelection.create(state.doc, $from.start(depth) + 1 + paragraph.content.size);
    }
  }
  return null;
}
