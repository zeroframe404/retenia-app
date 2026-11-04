import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { InlineNode } from '../../../preload/contract/notes';
import { type DocJson, inlineFromJson } from './convert';

// Qué renglones son tarjeta, para marcarlos en el editor. Es la misma regla que aplica el guardado
// (src/core/cards: un hueco o un «>>» con algo a cada lado); la ventana no puede importar del
// núcleo, así que la repite, y una prueba compara las dos con los mismos casos.

const ARROW = '>>';

const isBlank = (nodes: readonly InlineNode[]) =>
  nodes.every((node) => node.type === 'text' && node.text.trim() === '');

export type RowCard = { kind: 'qa' | 'cloze'; count: number } | null;

export function rowCardOf(content: readonly InlineNode[]): RowCard {
  const holes = content.filter((node) => node.type === 'cloze' && node.text.trim() !== '');
  if (holes.length > 0) {
    return { kind: 'cloze', count: holes.length };
  }
  const at = content.findIndex((node) => node.type === 'text' && node.text.includes(ARROW));
  const node = content[at];
  if (node?.type !== 'text') {
    return null;
  }
  const cut = node.text.indexOf(ARROW);
  const left: InlineNode[] = [
    ...content.slice(0, at),
    { type: 'text', text: node.text.slice(0, cut) },
  ];
  const right: InlineNode[] = [
    { type: 'text', text: node.text.slice(cut + ARROW.length) },
    ...content.slice(at + 1),
  ];
  return isBlank(left) || isBlank(right) ? null : { kind: 'qa', count: 1 };
}

// El renglón de ProseMirror (un `listItem` con su párrafo primero).
export function rowCardOfNode(row: ProseMirrorNode): RowCard {
  const paragraph = row.firstChild;
  if (!paragraph) {
    return null;
  }
  const json = paragraph.toJSON() as DocJson;
  return rowCardOf(inlineFromJson(json.content));
}
