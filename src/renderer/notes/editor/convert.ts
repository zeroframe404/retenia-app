import {
  type Block,
  type InlineNode,
  MAX_BLOCK_TEXT_LENGTH,
} from '../../../preload/contract/notes';
import { newBlockId } from './block-id';

// La conversión entre la lista plana de renglones del contrato (en orden de lectura, con
// `parentId`) y el JSON del documento de ProseMirror: una sola lista y, adentro de cada renglón,
// su párrafo y la lista de sus hijos.
export interface DocJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocJson[];
  text?: string;
}

function inlineToJson(node: InlineNode): DocJson {
  switch (node.type) {
    case 'text':
      return { type: 'text', text: node.text };
    case 'mention':
      return { type: 'mention', attrs: { id: node.id, label: node.label } };
    case 'image':
      return {
        type: 'image',
        attrs: { sha: node.sha, width: node.width, height: node.height, alt: node.alt },
      };
  }
}

function emptyRow(blockId: string): DocJson {
  return {
    type: 'listItem',
    attrs: { blockId, collapsed: false },
    content: [{ type: 'paragraph' }],
  };
}

export function blocksToDoc(blocks: readonly Block[]): DocJson {
  const known = new Set(blocks.map((block) => block.id));
  const children = new Map<string | null, Block[]>();
  for (const block of blocks) {
    const parent = block.parentId !== null && known.has(block.parentId) ? block.parentId : null;
    const siblings = children.get(parent);
    if (siblings) {
      siblings.push(block);
    } else {
      children.set(parent, [block]);
    }
  }

  const rowOf = (block: Block): DocJson => {
    const paragraph: DocJson =
      block.content.length === 0
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: block.content.map(inlineToJson) };
    const nested = children.get(block.id);
    return {
      type: 'listItem',
      attrs: { blockId: block.id, collapsed: block.collapsed },
      content:
        nested === undefined
          ? [paragraph]
          : [paragraph, { type: 'bulletList', content: nested.map(rowOf) }],
    };
  };

  const roots = children.get(null) ?? [];
  const rows = roots.length === 0 ? [emptyRow(newBlockId())] : roots.map(rowOf);
  return { type: 'doc', content: [{ type: 'bulletList', content: rows }] };
}

function inlineFromJson(content: readonly DocJson[] | undefined): InlineNode[] {
  const nodes: InlineNode[] = [];
  for (const node of content ?? []) {
    if (node.type === 'text' && node.text) {
      const last = nodes.at(-1);
      if (last?.type === 'text') {
        nodes[nodes.length - 1] = { type: 'text', text: last.text + node.text };
      } else {
        nodes.push({ type: 'text', text: node.text });
      }
    } else if (node.type === 'mention') {
      nodes.push({
        type: 'mention',
        id: String(node.attrs?.id ?? ''),
        label: String(node.attrs?.label ?? ''),
      });
    } else if (node.type === 'image') {
      nodes.push({
        type: 'image',
        sha: String(node.attrs?.sha ?? ''),
        width: Number(node.attrs?.width),
        height: Number(node.attrs?.height),
        alt: String(node.attrs?.alt ?? ''),
      });
    }
  }
  return nodes;
}

// El puente acepta hasta MAX_BLOCK_TEXT_LENGTH caracteres por nodo de texto. Un renglón con más se
// guarda en varios nodos seguidos (el editor los junta al abrir), sin partir un par sustituto
// (un emoji): antes ese guardado fallaba siempre y al cerrar se perdía lo escrito.
function splitLongText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    if (node.type !== 'text' || node.text.length <= MAX_BLOCK_TEXT_LENGTH) {
      out.push(node);
      continue;
    }
    for (let start = 0; start < node.text.length; ) {
      let end = Math.min(start + MAX_BLOCK_TEXT_LENGTH, node.text.length);
      const last = node.text.charCodeAt(end - 1);
      if (end < node.text.length && last >= 0xd800 && last <= 0xdbff) {
        end -= 1;
      }
      out.push({ type: 'text', text: node.text.slice(start, end) });
      start = end;
    }
  }
  return out;
}

export function docToBlocks(doc: DocJson): Block[] {
  const blocks: Block[] = [];
  const collect = (list: DocJson, parentId: string | null) => {
    for (const item of list.content ?? []) {
      if (item.type !== 'listItem') {
        continue;
      }
      const id = typeof item.attrs?.blockId === 'string' ? item.attrs.blockId : newBlockId();
      const paragraph = item.content?.find((child) => child.type === 'paragraph');
      blocks.push({
        id,
        parentId,
        collapsed: item.attrs?.collapsed === true,
        content: splitLongText(inlineFromJson(paragraph?.content)),
      });
      const nested = item.content?.find((child) => child.type === 'bulletList');
      if (nested) {
        collect(nested, id);
      }
    }
  };
  const root = doc.content?.find((child) => child.type === 'bulletList');
  if (root) {
    collect(root, null);
  }
  return blocks;
}
