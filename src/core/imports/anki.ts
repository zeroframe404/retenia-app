import type { Grade } from '../memory';
import { htmlPieces, htmlToPlain, tidy } from './html';
import {
  type AnnotatedItem,
  excerpt,
  type ImportPackage,
  MAX_TEXT,
  type PackageCard,
  type PackageContent,
  type PackageMedia,
  type PackageReview,
  type RejectedItem,
} from './package';

// Las reglas puras de la importación de Anki (H-29): sus botones, su historial, sus plantillas y su
// HTML, traducidos a Retenia. La lectura del archivo (el comprimido, la base SQLite, el protobuf)
// la hace el proceso aislado; acá llega la colección ya leída.

export interface AnkiCollection {
  notetypes: {
    id: number;
    name: string;
    kind: 'normal' | 'cloze';
    fields: string[];
    templates: { ord: number; qfmt: string; afmt: string }[];
  }[];
  decks: { id: number; name: string }[];
  notes: { id: number; guid: string; mid: number; tags: string[]; fields: string[] }[];
  cards: { id: number; nid: number; did: number; odid: number; ord: number; queue: number }[];
  revlog: { id: number; cid: number; ease: number; type: number }[];
}

// 1 = «No la sabía», 2 = «Con dudas», 3 y 4 = «La sabía» (Retenia no tiene «fácil»).
export function gradeOfAnkiEase(ease: number): Grade | null {
  switch (ease) {
    case 1:
      return 'again';
    case 2:
      return 'hard';
    case 3:
    case 4:
      return 'good';
    default:
      return null;
  }
}

// Son repasos los de aprendizaje (0), repaso (1), reaprendizaje (2) y mazo filtrado (3) con un
// botón de 1 a 4. Las reprogramaciones a mano (4), los reinicios (5) y el botón 0 no.
export function countsAsReview(entry: { type: number; ease: number }): boolean {
  return entry.type >= 0 && entry.type <= 3 && gradeOfAnkiEase(entry.ease) !== null;
}

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function clozeText(text: string, ord: number, side: 'question' | 'answer'): string {
  const wanted = ord + 1;
  if (side === 'answer') {
    return [...text.matchAll(CLOZE)]
      .filter((match) => Number(match[1]) === wanted)
      .map((match) => match[2] ?? '')
      .join(' · ');
  }
  return text.replace(CLOZE, (_whole, number: string, inner: string, hint: string | undefined) =>
    Number(number) === wanted ? `[${hint?.trim() ? hint.trim() : '...'}]` : inner,
  );
}

const SPECIAL_FIELDS = new Set(['Tags', 'Deck', 'Subdeck', 'Card', 'Type', 'CardFlag']);
const MAX_PASSES = 50;

// Arma un lado de una tarjeta desde su plantilla (el HTML que mostraría Anki, sin su estilo).
export function renderAnkiSide(
  template: string,
  fields: Readonly<Record<string, string>>,
  side: 'question' | 'answer',
  cardOrd: number,
  isCloze: boolean,
): string {
  const fieldValue = (name: string) => fields[name.trim()] ?? '';
  if (isCloze && side === 'answer') {
    // La respuesta de una cloze es lo que se ocultó.
    const field = /\{\{(?:[^}:]*:)*cloze:([^}]+)\}\}/.exec(template)?.[1];
    return field === undefined ? '' : clozeText(fieldValue(field), cardOrd, 'answer').trim();
  }
  let text = template;
  if (side === 'answer') {
    text = text.replace(/\{\{\s*FrontSide\s*\}\}/g, '');
    text = text.replace(/^\s*<hr[^>]*\bid\s*=\s*["']?answer["']?[^>]*>/i, '');
  }
  // Las secciones: {{#Campo}}…{{/Campo}} si está lleno, {{^Campo}}…{{/Campo}} si está vacío.
  const section = /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
  for (let pass = 0; pass < MAX_PASSES && section.test(text); pass++) {
    text = text.replace(section, (_whole, mark: string, name: string, inner: string) => {
      const filled = htmlToPlain(fieldValue(name.split(':').pop() ?? '')) !== '';
      return (mark === '#') === filled ? inner : '';
    });
  }
  text = text.replace(/\{\{([^{}]+)\}\}/g, (_whole, inside: string) => {
    const parts = inside.split(':');
    const name = (parts.pop() ?? '').trim();
    const filters = parts.map((filter) => filter.trim());
    if (filters.some((filter) => filter === 'type' || filter.startsWith('tts'))) {
      return '';
    }
    if (filters.includes('cloze')) {
      return isCloze ? clozeText(fieldValue(name), cardOrd, 'question') : fieldValue(name);
    }
    if (filters.some((filter) => filter.startsWith('image-occlusion'))) {
      return '';
    }
    if (filters.length === 0 && SPECIAL_FIELDS.has(name)) {
      return '';
    }
    const value = fieldValue(name);
    return filters.includes('text') ? htmlToPlain(value) : value;
  });
  return text.trim();
}

export interface AnkiNodes {
  nodes: PackageContent;
  missing: string[];
  unsupported: string[];
  audio: string[];
  latex: boolean;
}

// Junta los textos seguidos y saca los blancos del principio y del final.
export function tidyNodes(nodes: PackageContent): PackageContent {
  const merged: PackageContent = [];
  for (const node of nodes) {
    const last = merged.at(-1);
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  const cleaned = merged.map((node) =>
    node.type === 'text' ? { ...node, text: tidy(node.text) } : node,
  );
  const first = cleaned[0];
  if (first?.type === 'text') {
    cleaned[0] = { type: 'text', text: first.text.trimStart() };
  }
  const last = cleaned.at(-1);
  if (last?.type === 'text') {
    cleaned[cleaned.length - 1] = { type: 'text', text: last.text.trimEnd() };
  }
  return cleaned.filter((node) => node.type !== 'text' || node.text !== '');
}

function mediaNamed(
  media: ReadonlyMap<string, PackageMedia>,
  name: string,
): PackageMedia | undefined {
  const direct = media.get(name);
  if (direct) {
    return direct;
  }
  try {
    return media.get(decodeURIComponent(name));
  } catch {
    return undefined;
  }
}

// El HTML de un lado de la tarjeta como contenido de Retenia: texto, fórmulas entre signos $ e
// imágenes del mazo. Los audios se separan; lo que no vino en el mazo se informa.
export function ankiHtmlToNodes(html: string, media: ReadonlyMap<string, PackageMedia>): AnkiNodes {
  const audio: string[] = [];
  const missing: string[] = [];
  const unsupported: string[] = [];
  const withoutSounds = html.replace(/\[sound:([^\]]+)\]/g, (_whole, name: string) => {
    audio.push(name.trim());
    return ' ';
  });
  const latex = /\[(\$\$?|latex)\][\s\S]*?\[\/(\$\$?|latex)\]/i.test(withoutSounds);
  const nodes: PackageContent = [];
  for (const piece of htmlPieces(withoutSounds)) {
    if (piece.kind === 'text') {
      const text = piece.text
        .replace(/\\\(([\s\S]*?)\\\)/g, (_whole, inner: string) => `$${inner.trim()}$`)
        .replace(/\\\[([\s\S]*?)\\\]/g, (_whole, inner: string) => `$${inner.trim()}$`);
      nodes.push({ type: 'text', text });
      continue;
    }
    const found = mediaNamed(media, piece.src);
    if (!found) {
      missing.push(piece.src);
    } else if (found.kind !== 'image' || found.width === undefined || found.height === undefined) {
      unsupported.push(piece.src);
    } else {
      nodes.push({
        type: 'image',
        sha: found.sha,
        width: found.width,
        height: found.height,
        alt: found.name,
      });
    }
  }
  return { nodes: tidyNodes(nodes), missing, unsupported, audio, latex };
}

const plainOf = (nodes: PackageContent) =>
  nodes.map((node) => (node.type === 'text' || node.type === 'cloze' ? node.text : '')).join('');

const deckTopic = (name: string) =>
  // El formato actual separa los submazos con el carácter 31; el viejo, con «::».
  name
    .replaceAll(String.fromCharCode(31), '::')
    .split('::')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' › ') || null;

// La colección leída, convertida en el paquete de Retenia: una tarjeta por cada tarjeta de Anki, con
// sus repasos reales. Lo que no se puede traer queda rechazado con su motivo.
export function buildAnkiPackage(
  collection: AnkiCollection,
  media: ReadonlyMap<string, PackageMedia>,
): ImportPackage {
  const notetypes = new Map(collection.notetypes.map((type) => [type.id, type]));
  const notes = new Map(collection.notes.map((note) => [note.id, note]));
  const decks = new Map(collection.decks.map((deck) => [deck.id, deck.name]));
  const revlog = new Map<number, AnkiCollection['revlog']>();
  for (const entry of [...collection.revlog].sort((a, b) => a.id - b.id)) {
    const list = revlog.get(entry.cid);
    if (list) {
      list.push(entry);
    } else {
      revlog.set(entry.cid, [entry]);
    }
  }
  const cards: PackageCard[] = [];
  const rejected: RejectedItem[] = [];
  const rejectedBy: string[] = [];
  const annotated: AnnotatedItem[] = [];
  const annotatedBy: string[] = [];
  const used = new Map<string, PackageMedia>();
  let skippedReviews = 0;

  const ordered = [...collection.cards].sort(
    (a, b) => a.nid - b.nid || a.ord - b.ord || a.id - b.id,
  );
  for (const card of ordered) {
    const note = notes.get(card.nid);
    const type = note ? notetypes.get(note.mid) : undefined;
    if (!note || !type) {
      continue;
    }
    const key = `anki:${note.guid}:${card.ord}`;
    const reject = (what: string, reason: RejectedItem['reason']) => {
      rejected.push({ what, reason });
      rejectedBy.push(key);
    };
    const fields: Record<string, string> = {};
    type.fields.forEach((name, index) => {
      fields[name] = note.fields[index] ?? '';
    });
    const firstField = excerpt(htmlToPlain(note.fields[0] ?? '')) || '(tarjeta sin texto)';
    const templates = type.templates;
    if (templates.some((template) => /\{\{[^}]*image-occlusion:/.test(template.qfmt))) {
      reject(firstField, 'unsupportedCard');
      continue;
    }
    const isCloze = type.kind === 'cloze';
    const template = isCloze ? templates[0] : templates.find((item) => item.ord === card.ord);
    if (!template) {
      reject(firstField, 'unsupportedCard');
      continue;
    }
    const questionHtml = renderAnkiSide(template.qfmt, fields, 'question', card.ord, isCloze);
    const answerHtml = renderAnkiSide(template.afmt, fields, 'answer', card.ord, isCloze);
    const question = ankiHtmlToNodes(questionHtml, media);
    const answer = ankiHtmlToNodes(answerHtml, media);
    const questionText = excerpt(plainOf(question.nodes));
    if (note.fields.some((value) => value.length > MAX_TEXT)) {
      reject(questionText || firstField, 'tooLarge');
      continue;
    }
    if (
      plainOf(question.nodes).trim() === '' &&
      !question.nodes.some((node) => node.type === 'image')
    ) {
      reject(questionText || '(tarjeta sin texto)', 'emptyCard');
      continue;
    }
    if (
      plainOf(answer.nodes).trim() === '' &&
      !answer.nodes.some((node) => node.type === 'image') &&
      answer.audio.length === 0
    ) {
      reject(questionText, 'emptyCard');
      continue;
    }
    for (const name of [...question.missing, ...answer.missing]) {
      reject(`${questionText}: ${name}`, 'missingImage');
    }
    for (const name of [...question.unsupported, ...answer.unsupported]) {
      reject(`${questionText}: ${name}`, 'unsupportedImage');
    }
    if (question.latex || answer.latex) {
      annotated.push({ what: questionText, note: 'latex' });
      annotatedBy.push(key);
    }
    const audio: string[] = [];
    const withAudio = (nodes: PackageContent, names: string[]): PackageContent => {
      const lines: string[] = [];
      for (const name of names) {
        const found = media.get(name);
        if (found?.kind === 'audio') {
          audio.push(found.sha);
          used.set(found.sha, found);
          lines.push(`Audio: ${name}`);
        } else {
          reject(`${questionText}: ${name}`, 'missingAudio');
        }
      }
      return lines.length === 0
        ? nodes
        : tidyNodes([
            ...nodes,
            { type: 'text', text: `${nodes.length > 0 ? '\n' : ''}${lines.join('\n')}` },
          ]);
    };
    const questionNodes = withAudio(question.nodes, question.audio);
    const answerNodes = withAudio(answer.nodes, answer.audio);
    for (const node of [...questionNodes, ...answerNodes]) {
      if (node.type === 'image') {
        const found = [...media.values()].find((item) => item.sha === node.sha);
        if (found) {
          used.set(found.sha, found);
        }
      }
    }
    const reviews: PackageReview[] = [];
    for (const entry of revlog.get(card.id) ?? []) {
      const grade = gradeOfAnkiEase(entry.ease);
      if (!countsAsReview(entry) || grade === null) {
        skippedReviews += 1;
        continue;
      }
      reviews.push({ key: `${key}:${entry.id}`, at: new Date(entry.id).toISOString(), grade });
    }
    const firstReview = reviews[0];
    const created = new Date(card.id);
    const createdAt =
      firstReview && Date.parse(firstReview.at) < card.id ? firstReview.at : created.toISOString();
    const deckName = decks.get(card.odid !== 0 ? card.odid : card.did) ?? '';
    cards.push({
      key,
      topic: deckTopic(deckName),
      kind: isCloze ? 'cloze' : 'qa',
      question: questionNodes,
      answer: answerNodes,
      createdAt,
      reviews,
      suspended: card.queue === -1,
      tags: note.tags,
      audio,
    });
  }
  return {
    kind: 'anki',
    cards,
    notes: [],
    media: [...used.values()],
    rejected,
    rejectedBy,
    annotated,
    annotatedBy,
    skippedReviews,
  };
}
