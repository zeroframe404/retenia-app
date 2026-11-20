import { rowCardSpecs } from '../cards';
import type {
  AnnotatedItem,
  ImportPackage,
  PackageBlock,
  PackageContent,
  RejectedItem,
} from './package';

// La vista previa de una importación (H-29): cuánto entra, cuánto ya estaba (por la huella de cada
// elemento, CA-124), qué se rechaza con su motivo y qué se anota. No escribe nada.

export interface ImportPlan {
  cards: { fresh: number; existing: number };
  notes: { fresh: number; existing: number };
  // Los repasos de lo que entra (lo que ya estaba no trae los suyos otra vez).
  reviews: number;
  // Las tarjetas que entran sin historial: llegan «Disponibles».
  withoutHistory: number;
  rejected: RejectedItem[];
  annotated: AnnotatedItem[];
}

// Las tarjetas que va a pedir un renglón: las de su contenido (huecos o «>>») y, si es de ida y
// vuelta, su inversa.
export function cardsOfBlock(block: Pick<PackageBlock, 'content' | 'inverse'>): number {
  const specs = rowCardSpecs(asRowContent(block.content));
  return specs.length + (block.inverse && specs[0]?.kind === 'qa' ? 1 : 0);
}

// El contenido del paquete con la forma del renglón (los enlaces y los huecos con identificadores
// de mentira: solo para contar).
function asRowContent(content: PackageContent) {
  return content.map((node, index) => {
    if (node.type === 'link') {
      return { type: 'mention' as const, id: `link-${index}`, label: node.label };
    }
    if (node.type === 'cloze') {
      return { type: 'cloze' as const, id: `cloze-${index}`, text: node.text };
    }
    return node;
  });
}

export function planImport(pkg: ImportPackage, existing: ReadonlySet<string>): ImportPlan {
  const plan: ImportPlan = {
    cards: { fresh: 0, existing: 0 },
    notes: { fresh: 0, existing: 0 },
    reviews: 0,
    withoutHistory: 0,
    rejected: [],
    annotated: [],
  };
  for (const card of pkg.cards) {
    if (existing.has(card.key)) {
      plan.cards.existing += 1;
      continue;
    }
    plan.cards.fresh += 1;
    plan.reviews += card.reviews.length;
    if (card.reviews.length === 0) {
      plan.withoutHistory += 1;
    }
  }
  for (const note of pkg.notes) {
    const count = note.blocks.reduce((sum, block) => sum + cardsOfBlock(block), 0);
    if (existing.has(note.key)) {
      plan.notes.existing += 1;
      plan.cards.existing += count;
    } else {
      plan.notes.fresh += 1;
      plan.cards.fresh += count;
      // RemNote no exporta repasos: todas sus tarjetas llegan sin historial.
      plan.withoutHistory += count;
    }
  }
  const fresh = (owner: string | undefined) =>
    owner === undefined || owner === '' || !existing.has(owner);
  plan.rejected = pkg.rejected.filter((_item, index) => fresh(pkg.rejectedBy[index]));
  plan.annotated = pkg.annotated.filter((_item, index) => fresh(pkg.annotatedBy[index]));
  return plan;
}
