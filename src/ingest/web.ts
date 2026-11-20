import { Readability } from '@mozilla/readability';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import type { BlockDraft } from '../core/materials/blocks';

// La parte del DOM de jsdom que se usa acá (jsdom no trae tipos y el proyecto no incluye los del
// navegador).
interface DomNode {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
  remove(): void;
  replaceWith(...nodes: DomNode[]): void;
}
interface DomElement extends DomNode {
  tagName: string;
  innerHTML: string;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  querySelector(selector: string): DomElement | null;
  prepend(...nodes: DomNode[]): void;
}
interface DomDocument extends DomNode {
  title: string;
  body: DomElement;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  querySelector(selector: string): DomElement | null;
  createElement(tag: string): DomElement;
  cloneNode(deep?: boolean): DomDocument;
}
const documentOf = (html: string) =>
  (new JSDOM(html).window as unknown as { document: DomDocument }).document;

// Páginas web como material (Fase 14, H-28): se extrae el contenido principal (el mismo algoritmo
// que el modo lectura de Firefox), se sanea con una lista de lo permitido y se guarda solo eso.
// Nada de lo que trae la página se ejecuta ni se baja: el DOM se arma sin correr scripts y sin
// cargar recursos, y lo que queda es texto con su estructura, sin imágenes, sin formularios, sin
// estilos y sin una sola dirección.

// Lo único que puede quedar en la instantánea.
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'pre',
  'code',
  'blockquote',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'sub',
  'sup',
  'small',
  'mark',
  'del',
  'ins',
  'abbr',
  'cite',
  'q',
  'span',
  'a',
  'div',
  'section',
  'article',
  'figure',
  'figcaption',
];
const ALLOWED_ATTR = ['colspan', 'rowspan', 'lang', 'dir'];

// Lo que se saca antes de buscar el contenido principal: no es contenido y no hay que dejar que
// influya en la elección.
const NOT_CONTENT =
  'script,style,noscript,template,link,meta,iframe,object,embed,form,input,button,select,textarea,svg,canvas,audio,video,dialog,[hidden]';
// Menos que esto no es un artículo: puede ser un menú o un cartel.
const MIN_ARTICLE_CHARS = 40;
const NOISE =
  'nav,aside,header,footer,.navbox,.mw-editsection,.noprint,.toc,#toc,.sidebar,.advertisement,.ad';

export interface WebSnapshot {
  title: string;
  // El HTML saneado del contenido principal, sin envoltorio (un fragmento).
  html: string;
  drafts: BlockDraft[];
}

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();

const draft = (type: BlockDraft['type'], lines: string[], level = 0): BlockDraft => ({
  type,
  level,
  unit: 1,
  lines: lines.map((text) => ({ text, box: null })),
});

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL',
]);

// De un fragmento ya saneado a los bloques de Retenia: títulos, párrafos, listas, tablas y código.
function draftsOf(root: DomElement): BlockDraft[] {
  const drafts: BlockDraft[] = [];
  let inline: string[] = [];
  const flush = () => {
    const text = collapse(inline.join(''));
    if (text !== '') {
      drafts.push(draft('paragraph', [text]));
    }
    inline = [];
  };
  const visit = (node: DomNode) => {
    if (node.nodeType === 3) {
      inline.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }
    const element = node as DomElement;
    const tag = element.tagName;
    const heading = /^H([1-6])$/u.exec(tag);
    if (heading) {
      flush();
      const text = collapse(element.textContent ?? '');
      if (text !== '') {
        drafts.push(draft('section', [text], Number(heading[1])));
      }
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const items = Array.from(element.querySelectorAll('li'))
        .map((item) => collapse(item.textContent ?? ''))
        .filter((text) => text !== '');
      if (items.length > 0) {
        drafts.push(draft('list', items));
      }
    } else if (tag === 'TABLE') {
      flush();
      const rows = Array.from(element.querySelectorAll('tr'))
        .map((row) =>
          Array.from(row.querySelectorAll('th,td'))
            .map((cell) => collapse(cell.textContent ?? ''))
            .join('\t'),
        )
        .filter((row) => row.replaceAll('\t', '') !== '');
      if (rows.length > 0) {
        drafts.push(draft('table', rows));
      }
    } else if (tag === 'PRE') {
      flush();
      const lines = (element.textContent ?? '').replace(/\r\n?/gu, '\n').split('\n');
      while (lines.at(-1)?.trim() === '') {
        lines.pop();
      }
      if (lines.length > 0) {
        drafts.push(draft('code', lines));
      }
    } else if (tag === 'HR') {
      flush();
    } else if (tag === 'BR') {
      inline.push(' ');
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
      for (const child of Array.from(element.childNodes)) {
        visit(child);
      }
      flush();
    } else {
      for (const child of Array.from(element.childNodes)) {
        visit(child);
      }
    }
  };
  for (const child of Array.from(root.childNodes)) {
    visit(child);
  }
  flush();
  return drafts;
}

function cleaned(html: string): { document: DomDocument; title: string } {
  const document = documentOf(html);
  for (const node of Array.from(document.querySelectorAll(NOT_CONTENT))) {
    node.remove();
  }
  return { document, title: collapse(document.title) };
}

// El contenido principal de la página como HTML, o null si no hay: primero con readability y, si
// no encuentra un artículo, con el contenido de `<main>`, `<article>` o `<body>` sin los menús.
function mainContent(html: string): { title: string; content: string } | null {
  const { document, title } = cleaned(html);
  const article = new Readability(document.cloneNode(true) as never, {
    charThreshold: 200,
  }).parse();
  if (article?.content && collapse(article.textContent ?? '').length >= MIN_ARTICLE_CHARS) {
    return { title: collapse(article.title ?? '') || title, content: article.content };
  }
  for (const node of Array.from(document.querySelectorAll(NOISE))) {
    node.remove();
  }
  const root = document.querySelector('main, article, [role="main"]') ?? document.body;
  const text = collapse(root.textContent ?? '');
  return text.length < MIN_ARTICLE_CHARS ? null : { title, content: root.innerHTML };
}

// La instantánea de una página: su título, su contenido principal saneado y sus bloques. Devuelve
// null si la página no tiene texto que guardar.
export function snapshotWeb(html: string): WebSnapshot | null {
  const found = mainContent(html);
  if (!found) {
    return null;
  }
  const purify = createDOMPurify(new JSDOM('').window as never);
  const clean = purify.sanitize(found.content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    KEEP_CONTENT: true,
  });
  const fragment = documentOf(`<body>${String(clean)}</body>`);
  const body = fragment.body;
  // Sin direcciones: los enlaces quedan como texto.
  for (const link of Array.from(body.querySelectorAll('a'))) {
    link.replaceWith(...Array.from(link.childNodes));
  }
  const text = collapse(body.textContent ?? '');
  if (text === '') {
    return null;
  }
  const title = found.title || collapse(body.querySelector('h1')?.textContent ?? '');
  const hasTitle = Array.from(body.querySelectorAll('h1,h2')).some(
    (heading) => collapse(heading.textContent ?? '') === title,
  );
  if (title !== '' && !hasTitle) {
    const heading = fragment.createElement('h1');
    heading.textContent = title;
    body.prepend(heading);
  }
  const drafts = draftsOf(body);
  if (drafts.length === 0) {
    return null;
  }
  return { title, html: body.innerHTML, drafts };
}
