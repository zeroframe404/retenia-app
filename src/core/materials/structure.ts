import type { BlockDraft, BlockType, Box } from './blocks';

// El análisis de estructura de un PDF (H-25): de los pedazos de texto que da el lector de cada
// página (con su caja, su letra y su tamaño) salen bloques con su tipo. Los títulos se deducen del
// índice del PDF si lo trae, y si no del tamaño de letra relativo al cuerpo. Nada se inventa: cada
// bloque es texto que está en la página.

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  bold: boolean;
  fontFamily: string;
  fontName: string;
}

export interface PdfPageExtract {
  page: number;
  width: number;
  height: number;
  items: PdfTextItem[];
  // Las cajas de las imágenes de la página.
  images: { x: number; y: number; width: number; height: number }[];
}

export interface OutlineEntry {
  title: string;
  page: number | null;
  level: number;
}

interface Line {
  page: number;
  text: string;
  box: Box;
  size: number;
  bold: boolean;
  family: string;
  monospace: boolean;
  // Los pedazos separados por un hueco grande (las celdas de una fila de tabla).
  cells: { text: string; x: number; end: number }[];
}

const round = (value: number) => Math.round(value * 2) / 2;

function majority<T>(values: readonly T[], weights: readonly number[]): T | undefined {
  const totals = new Map<T, number>();
  values.forEach((value, index) => {
    totals.set(value, (totals.get(value) ?? 0) + (weights[index] ?? 1));
  });
  let best: T | undefined;
  let bestWeight = -1;
  for (const [value, weight] of totals) {
    if (weight > bestWeight) {
      best = value;
      bestWeight = weight;
    }
  }
  return best;
}

const isMonospace = (item: PdfTextItem) =>
  /mono/i.test(item.fontFamily) || /courier|mono|consol|menlo/i.test(item.fontName);

// Junta los pedazos de una página en renglones: los que comparten la altura, de izquierda a derecha.
function linesOf(page: PdfPageExtract): Line[] {
  // Los pedazos que son solo espacio (algunos PDF los ponen anchos, tapando el hueco entre celdas)
  // no cuentan: el espacio entre palabras sale de la distancia entre pedazos.
  const items = page.items
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const item of items) {
    const center = item.y + item.height / 2;
    const group = groups.find((candidate) => {
      const first = candidate[0] as PdfTextItem;
      const middle = first.y + first.height / 2;
      return Math.abs(middle - center) <= Math.max(first.height, item.height) * 0.45;
    });
    if (group) {
      group.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.x - b.x);
      const size = Math.max(...sorted.map((item) => item.size));
      // Un hueco de más de dos letras separa celdas; uno chico, palabras.
      const cells: { text: string; x: number; end: number }[] = [];
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const item of sorted) {
        const gap = item.x - previousEnd;
        const last = cells.at(-1);
        if (!last || gap > size * 2) {
          cells.push({ text: item.text, x: item.x, end: item.x + item.width });
        } else {
          const needsSpace = gap > size * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(item.text);
          last.text = `${last.text}${needsSpace ? ' ' : ''}${item.text}`;
          last.end = item.x + item.width;
        }
        previousEnd = item.x + item.width;
      }
      for (const cell of cells) {
        cell.text = cell.text.replace(/[  ]+/g, ' ').trim();
      }
      const text = cells.map((cell) => cell.text).join(' ');
      const left = Math.min(...sorted.map((item) => item.x));
      const top = Math.min(...sorted.map((item) => item.y));
      const right = Math.max(...sorted.map((item) => item.x + item.width));
      const bottom = Math.max(...sorted.map((item) => item.y + item.height));
      const weights = sorted.map((item) => item.text.length);
      return {
        page: page.page,
        text: text.trim(),
        box: { page: page.page, x: left, y: top, width: right - left, height: bottom - top },
        size,
        bold:
          majority(
            sorted.map((item) => item.bold),
            weights,
          ) ?? false,
        family:
          majority(
            sorted.map((item) => item.fontFamily),
            weights,
          ) ?? '',
        monospace: majority(sorted.map(isMonospace), weights) ?? false,
        cells,
      };
    })
    .filter((line) => line.text !== '');
}

const MATH = /[=±√∑∫≤≥≈≠∞∂∆∇µμσπ]|[∀-⋿]/u;
const BULLET = /^(?:[•·▪‣◦●○■□–—*-]\s+|\d{1,2}[.)]\s+)\S/u;
const PAGE_NUMBER = /^(?:p(?:á|a)g(?:ina)?\.?\s*)?\d{1,4}(?:\s*(?:de|\/)\s*\d{1,4})?$/iu;
const NUMBERING = /^(\d+(?:\.\d+)*)\.?\s+\S/u;
const CHAPTER = /^cap[íi]tulo\s+(\d+)/iu;

const pattern = (text: string) => text.replace(/\d+/g, '#').toLowerCase();

// Encabezados y pies: lo que está arriba o abajo de la hoja y se repite en varias páginas (o es
// solo el número de página).
function marginalKind(line: Line, page: PdfPageExtract, repeated: Set<string>): BlockType | null {
  const top = line.box.y + line.box.height <= page.height * 0.07;
  const bottom = line.box.y >= page.height * 0.9;
  if (!top && !bottom) {
    return null;
  }
  if (PAGE_NUMBER.test(line.text) || repeated.has(pattern(line.text))) {
    return top ? 'header' : 'footer';
  }
  return null;
}

function numberPath(text: string): number[] | null {
  const chapter = CHAPTER.exec(text);
  if (chapter) {
    return [Number(chapter[1])];
  }
  const numbered = NUMBERING.exec(text);
  return numbered ? (numbered[1] ?? '').split('.').map(Number) : null;
}

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function structurePdf(
  pages: readonly PdfPageExtract[],
  outline: readonly OutlineEntry[],
): BlockDraft[] {
  const perPage = pages.map((page) => ({ page, lines: linesOf(page) }));
  const allLines = perPage.flatMap((entry) => entry.lines);
  const bodySize =
    majority(
      allLines.map((line) => round(line.size)),
      allLines.map((line) => line.text.length),
    ) ?? 11;
  const bodyFamily =
    majority(
      allLines.map((line) => line.family),
      allLines.map((line) => line.text.length),
    ) ?? '';

  // Lo que se repite arriba o abajo de dos páginas o más.
  const marginCounts = new Map<string, number>();
  for (const { page, lines } of perPage) {
    const seen = new Set<string>();
    for (const line of lines) {
      const top = line.box.y + line.box.height <= page.height * 0.07;
      const bottom = line.box.y >= page.height * 0.9;
      if ((top || bottom) && !seen.has(pattern(line.text))) {
        seen.add(pattern(line.text));
        marginCounts.set(pattern(line.text), (marginCounts.get(pattern(line.text)) ?? 0) + 1);
      }
    }
  }
  const repeated = new Set(
    [...marginCounts].filter(([, count]) => count >= 2 && pages.length >= 2).map(([key]) => key),
  );

  const outlineTitles = new Map(outline.map((entry) => [fold(entry.title), entry.level]));
  const headingSizes = [
    ...new Set(
      allLines
        .filter((line) => round(line.size) >= bodySize * 1.12 && !MATH.test(line.text))
        .map((line) => round(line.size)),
    ),
  ].sort((a, b) => b - a);

  const blocks: BlockDraft[] = [];
  const sections: {
    level: number;
    original: number;
    number: number[] | null;
    promoted: boolean;
  }[] = [];
  const pushLine = (type: BlockType, line: Line, level = 0) => {
    blocks.push({ type, level, unit: line.page, lines: [{ text: line.text, box: line.box }] });
  };

  for (const { page, lines } of perPage) {
    // Las imágenes entran como figuras en su lugar de arriba hacia abajo.
    const figures = page.images
      .filter((image) => image.width * image.height >= page.width * page.height * 0.01)
      .map((image) => ({ y: image.y, box: { page: page.page, ...image } }));
    type Entry = { y: number; line?: Line; figure?: Box };
    const entries: Entry[] = [
      ...lines.map((line) => ({ y: line.box.y, line })),
      ...figures.map((figure) => ({ y: figure.y, figure: figure.box })),
    ].sort((a, b) => a.y - b.y);

    let current: BlockDraft | null = null;
    let previousLine: Line | null = null;
    let pitch: number | null = null;
    const close = () => {
      current = null;
      pitch = null;
    };

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index] as Entry;
      if (entry.figure) {
        close();
        blocks.push({
          type: 'figure',
          level: 0,
          unit: page.page,
          lines: [{ text: '', box: entry.figure }],
        });
        previousLine = null;
        continue;
      }
      const line = entry.line as Line;
      const marginal = marginalKind(line, page, repeated);
      if (marginal) {
        close();
        pushLine(marginal, line);
        previousLine = null;
        continue;
      }
      const big = round(line.size) >= bodySize * 1.12;
      const otherFamily = line.family !== bodyFamily;
      if (
        MATH.test(line.text) &&
        line.text.length <= 120 &&
        (otherFamily || round(line.size) >= bodySize * 1.3)
      ) {
        // Los renglones de una misma fórmula (una fracción: arriba, el signo, abajo) van juntos.
        const formula = current as BlockDraft | null;
        if (
          formula?.type === 'formula' &&
          previousLine &&
          line.box.y - previousLine.box.y <= line.size * 3
        ) {
          formula.lines.push({ text: line.text, box: line.box });
        } else {
          close();
          current = {
            type: 'formula',
            level: 0,
            unit: page.page,
            lines: [{ text: line.text, box: line.box }],
          };
          blocks.push(current);
        }
        previousLine = line;
        continue;
      }
      // Lo de arriba de la primera página, más chico que el cuerpo y antes de cualquier título (una
      // portada, el nombre del curso): el título del documento.
      if (
        page.page === pages[0]?.page &&
        sections.length === 0 &&
        round(line.size) < bodySize &&
        line.text.length <= 120
      ) {
        close();
        pushLine('title', line);
        previousLine = null;
        continue;
      }
      const outlineLevel = outlineTitles.get(fold(line.text));
      const isHeading =
        /\p{L}/u.test(line.text) &&
        line.text.length <= 150 &&
        (outlineLevel !== undefined || (outline.length === 0 && big));
      if (isHeading) {
        close();
        let level = outlineLevel ?? (headingSizes.indexOf(round(line.size)) + 1 || 1);
        level = Math.min(level, 6);
        const original = level;
        const number = numberPath(line.text);
        let promoted = false;
        const parent = [...sections].reverse().find((section) => section.level < level);
        if (parent && level > 1) {
          if (parent.promoted && parent.original === original) {
            level = parent.level;
            promoted = true;
          } else if (
            number &&
            parent.number &&
            number.length > 1 &&
            number[0] !== parent.number[0]
          ) {
            level = parent.level;
            promoted = true;
          }
        }
        sections.push({ level, original, number, promoted });
        pushLine('section', line, level);
        previousLine = line;
        continue;
      }
      if (line.monospace) {
        if (current && (current as BlockDraft).type === 'code') {
          (current as BlockDraft).lines.push({ text: line.text, box: line.box });
        } else {
          close();
          current = {
            type: 'code',
            level: 0,
            unit: page.page,
            lines: [{ text: line.text, box: line.box }],
          };
          blocks.push(current);
        }
        previousLine = line;
        continue;
      }
      // Una fila de tabla: dos celdas o más, alineadas con la fila de al lado.
      const next = entries[index + 1]?.line;
      const aligned = (a: Line, b: Line) =>
        a.cells.length >= 2 &&
        a.cells.length === b.cells.length &&
        a.cells.every((cell, at) => {
          const other = b.cells[at];
          // Una columna se alinea por la izquierda o por la derecha (los números).
          return (
            other !== undefined &&
            (Math.abs(cell.x - other.x) <= 8 || Math.abs(cell.end - other.end) <= 8)
          );
        });
      const rowText = line.cells.map((cell) => cell.text).join('\t');
      if (
        current &&
        (current as BlockDraft).type === 'table' &&
        previousLine &&
        aligned(line, previousLine)
      ) {
        (current as BlockDraft).lines.push({ text: rowText, box: line.box });
        previousLine = line;
        continue;
      }
      if (next && aligned(line, next)) {
        close();
        current = {
          type: 'table',
          level: 0,
          unit: page.page,
          lines: [{ text: rowText, box: line.box }],
        };
        blocks.push(current);
        previousLine = line;
        continue;
      }
      if (BULLET.test(line.text)) {
        if (current && (current as BlockDraft).type === 'list') {
          (current as BlockDraft).lines.push({ text: line.text, box: line.box });
        } else {
          close();
          current = {
            type: 'list',
            level: 0,
            unit: page.page,
            lines: [{ text: line.text, box: line.box }],
          };
          blocks.push(current);
        }
        previousLine = line;
        continue;
      }
      // Un párrafo: renglones seguidos con el mismo paso entre ellos.
      const gap = previousLine ? line.box.y - previousLine.box.y : Number.POSITIVE_INFINITY;
      const sameParagraph =
        current !== null &&
        ((current as BlockDraft).type === 'paragraph' || (current as BlockDraft).type === 'list') &&
        previousLine !== null &&
        Math.abs(round(previousLine.size) - round(line.size)) < 1 &&
        (pitch === null ? gap <= line.size * 1.75 : gap <= pitch * 1.3);
      if (sameParagraph) {
        (current as unknown as BlockDraft).lines.push({ text: line.text, box: line.box });
        pitch ??= gap;
      } else {
        close();
        current = {
          type: 'paragraph',
          level: 0,
          unit: page.page,
          lines: [{ text: line.text, box: line.box }],
        };
        blocks.push(current);
      }
      previousLine = line;
    }
  }
  return blocks;
}
