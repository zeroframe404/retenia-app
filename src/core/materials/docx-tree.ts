import type { BlockDraft, BlockType } from './blocks';

// Un Word por dentro (H-25, CA-107): el árbol del documento que arma el lector (mammoth), pasado a
// datos simples, se convierte en bloques. Los títulos salen del estilo («Title» es el título del
// documento; «Heading N», una sección de nivel N), los párrafos numerados o con viñeta forman una
// lista, una tabla es una tabla y una imagen es una figura (no se la abre: solo su texto
// alternativo).

export interface DocxNode {
  type: string;
  children?: DocxNode[];
  value?: string;
  styleId?: string | null;
  styleName?: string | null;
  numbering?: { level: string; isOrdered: boolean } | null;
  altText?: string | null;
}

function textOf(node: DocxNode): string {
  if (node.type === 'text') {
    return node.value ?? '';
  }
  if (node.type === 'tab') {
    return '\t';
  }
  if (node.type === 'break') {
    return ' ';
  }
  return (node.children ?? []).map(textOf).join('');
}

function imagesOf(node: DocxNode): DocxNode[] {
  if (node.type === 'image') {
    return [node];
  }
  return (node.children ?? []).flatMap(imagesOf);
}

function headingLevel(node: DocxNode): number | null {
  const byId = /^heading\s*(\d)$/i.exec(node.styleId ?? '');
  const byName = /^heading\s*(\d)$/i.exec(node.styleName ?? '');
  const level = byId?.[1] ?? byName?.[1];
  return level ? Number(level) : null;
}

const isTitle = (node: DocxNode) =>
  /^title$/i.test(node.styleId ?? '') || /^title$/i.test(node.styleName ?? '');

const draft = (type: BlockType, lines: string[], level = 0): BlockDraft => ({
  type,
  level,
  unit: 1,
  lines: lines.map((text) => ({ text, box: null })),
});

function cellText(cell: DocxNode): string {
  return (cell.children ?? [])
    .map(textOf)
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join(' ');
}

export function blocksFromDocx(tree: DocxNode): BlockDraft[] {
  const blocks: BlockDraft[] = [];
  let list: BlockDraft | null = null;
  const visit = (node: DocxNode) => {
    if (node.type === 'table') {
      list = null;
      const rows = (node.children ?? [])
        .filter((row) => row.type === 'tableRow')
        .map((row) =>
          (row.children ?? [])
            .filter((cell) => cell.type === 'tableCell')
            .map(cellText)
            .join('\t'),
        );
      if (rows.length > 0) {
        blocks.push(draft('table', rows));
      }
      return;
    }
    if (node.type !== 'paragraph') {
      for (const child of node.children ?? []) {
        visit(child);
      }
      return;
    }
    const text = textOf(node).replace(/[  ]+/g, ' ').trim();
    if (text === '') {
      const [image] = imagesOf(node);
      if (image) {
        list = null;
        blocks.push(draft('figure', [image.altText?.trim() ?? '']));
      }
      return;
    }
    const level = headingLevel(node);
    if (isTitle(node)) {
      list = null;
      blocks.push(draft('title', [text]));
    } else if (level !== null) {
      list = null;
      blocks.push(draft('section', [text], level));
    } else if (node.numbering) {
      if (list) {
        (list as BlockDraft).lines.push({ text, box: null });
      } else {
        list = draft('list', [text]);
        blocks.push(list);
      }
    } else {
      list = null;
      blocks.push(draft('paragraph', [text]));
    }
  };
  visit(tree);
  return blocks;
}
