import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  type Block,
  blockSchema,
  type InlineNode,
  outlineIssue,
} from '../../src/preload/contract/notes';
import { newBlockId } from '../../src/renderer/notes/editor/block-id';
import { blocksToDoc, docToBlocks } from '../../src/renderer/notes/editor/convert';

const SEED = 20291029;

const uuid = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const hex = fc.string({
  unit: fc.constantFrom(...'0123456789abcdef'.split('')),
  minLength: 64,
  maxLength: 64,
});

const inlineNode: fc.Arbitrary<InlineNode> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 24, unit: 'grapheme' }).map((text) => ({
    type: 'text' as const,
    text,
  })),
  fc
    .record({
      id: fc.nat(50).map((n) => uuid(1000 + n)),
      label: fc.string({ maxLength: 24, unit: 'grapheme' }),
    })
    .map((mention) => ({ type: 'mention' as const, ...mention })),
  fc
    .record({
      sha: hex,
      width: fc.integer({ min: 1, max: 20_000 }),
      height: fc.integer({ min: 1, max: 20_000 }),
      alt: fc.string({ maxLength: 24, unit: 'grapheme' }),
    })
    .map((image) => ({ type: 'image' as const, ...image })),
);

// Dos textos seguidos son uno solo (así los lee y los escribe el editor).
function mergeText(content: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of content) {
    const last = merged.at(-1);
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

// Una lista plana en orden de lectura: la profundidad de cada renglón es a lo sumo una más que la
// del anterior, y su padre es el último renglón de la profundidad de arriba.
const outline: fc.Arbitrary<Block[]> = fc
  .array(
    fc.record({
      depth: fc.integer({ min: 0, max: 4 }),
      content: fc.array(inlineNode, { maxLength: 4 }),
      collapsed: fc.boolean(),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((rows) => {
    const lastAtDepth: string[] = [];
    let previousDepth = -1;
    return rows.map((row, index) => {
      const depth = Math.min(row.depth, previousDepth + 1);
      previousDepth = depth;
      const id = uuid(index + 1);
      lastAtDepth[depth] = id;
      return {
        id,
        parentId: depth === 0 ? null : (lastAtDepth[depth - 1] ?? null),
        collapsed: row.collapsed,
        content: mergeText(row.content),
      };
    });
  });

describe('editor · conversión entre los renglones del contrato y el documento', () => {
  it('lo que se arma para la prueba es un esquema válido del contrato', () => {
    fc.assert(
      fc.property(outline, (blocks) => {
        expect(outlineIssue(blocks)).toBeNull();
        for (const block of blocks) {
          expect(blockSchema.safeParse(block).success).toBe(true);
        }
      }),
      { seed: SEED },
    );
  });

  it('ida y vuelta exacta: renglones → documento → renglones da lo mismo, con cualquier anidado', () => {
    fc.assert(
      fc.property(outline, (blocks) => {
        expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('el documento tiene una sola lista y cada renglón es un párrafo con sus hijos en otra lista', () => {
    const blocks: Block[] = [
      { id: uuid(1), parentId: null, collapsed: true, content: [{ type: 'text', text: 'Uno' }] },
      {
        id: uuid(2),
        parentId: uuid(1),
        collapsed: false,
        content: [{ type: 'text', text: 'Dos' }],
      },
      { id: uuid(3), parentId: null, collapsed: false, content: [] },
    ];
    expect(blocksToDoc(blocks)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              attrs: { blockId: uuid(1), collapsed: true },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      attrs: { blockId: uuid(2), collapsed: false },
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              attrs: { blockId: uuid(3), collapsed: false },
              content: [{ type: 'paragraph' }],
            },
          ],
        },
      ],
    });
  });

  it('enlaces e imágenes viajan como nodos en línea con sus atributos', () => {
    const sha = 'a'.repeat(64);
    const blocks: Block[] = [
      {
        id: uuid(1),
        parentId: null,
        collapsed: false,
        content: [
          { type: 'text', text: 'Ver ' },
          { type: 'mention', id: uuid(9), label: 'Media y desvío' },
          { type: 'image', sha, width: 640, height: 480, alt: 'Una campana' },
        ],
      },
    ];
    const paragraph = blocksToDoc(blocks).content?.[0]?.content?.[0]?.content?.[0];
    expect(paragraph?.content).toEqual([
      { type: 'text', text: 'Ver ' },
      { type: 'mention', attrs: { id: uuid(9), label: 'Media y desvío' } },
      { type: 'image', attrs: { sha, width: 640, height: 480, alt: 'Una campana' } },
    ]);
  });

  it('un texto vacío no genera nodo de texto y un renglón sin contenido es un párrafo vacío', () => {
    const doc = blocksToDoc([{ id: uuid(1), parentId: null, collapsed: false, content: [] }]);
    const paragraph = doc.content?.[0]?.content?.[0]?.content?.[0];
    expect(paragraph).toEqual({ type: 'paragraph' });
    expect(JSON.stringify(doc)).not.toContain('"text":""');
  });

  it('una nota sin renglones se abre con un renglón vacío que ya tiene su identificador', () => {
    const blocks = docToBlocks(blocksToDoc([]));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.parentId).toBeNull();
    expect(blocks[0]?.content).toEqual([]);
    expect(z.uuid().safeParse(blocks[0]?.id).success).toBe(true);
  });

  it('lo que sale del documento es lo que el puente acepta: un padre siempre antes que sus hijos', () => {
    fc.assert(
      fc.property(outline, (blocks) => {
        const back = docToBlocks(blocksToDoc(blocks));
        expect(outlineIssue(back)).toBeNull();
        expect(back.map((block) => block.id)).toEqual(blocks.map((block) => block.id));
      }),
      { seed: SEED },
    );
  });
});

describe('editor · identificadores de renglón', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('es un UUID versión 7 que pasa la validación del contrato', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (now) => {
        const id = newBlockId(now);
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(z.uuid().safeParse(id).success).toBe(true);
      }),
      { seed: SEED },
    );
    expect(z.uuid().safeParse(newBlockId()).success).toBe(true);
  });

  it('empieza con los milisegundos de la hora que se le da (48 bits, de mayor a menor)', () => {
    expect(newBlockId(0x018f_1234_5678).startsWith('018f1234-5678-7')).toBe(true);
  });

  it('los bits de versión y de variante quedan bien con bytes al azar de puros ceros y de puros unos', () => {
    const fill = (value: number) =>
      vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
        array.fill(value);
        return array;
      }) as typeof crypto.getRandomValues);
    fill(0x00);
    expect(newBlockId(0x018f_1234_5678)).toBe('018f1234-5678-7000-8000-000000000000');
    vi.restoreAllMocks();
    fill(0xff);
    expect(newBlockId(0x018f_1234_5678)).toBe('018f1234-5678-7fff-bfff-ffffffffffff');
  });

  it('los armados en un milisegundo más tarde se ordenan después', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 48 - 2 }),
        fc.integer({ min: 1, max: 10_000 }),
        (now, later) => {
          const after = Math.min(now + later, 2 ** 48 - 1);
          fc.pre(after > now);
          expect(newBlockId(now) < newBlockId(after)).toBe(true);
        },
      ),
      { seed: SEED },
    );
  });

  it('mil identificadores seguidos no se repiten', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newBlockId()));
    expect(ids.size).toBe(1000);
  });
});
