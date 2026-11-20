// La representación interna de un material (H-25): bloques con su tipo, su texto crudo por
// renglones y, en un PDF, la caja de cada renglón en la hoja (en puntos, con el origen arriba a la
// izquierda, como las dibuja la ventana).

export type BlockType =
  | 'section'
  | 'title'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'formula'
  | 'figure'
  | 'code'
  | 'header'
  | 'footer';

export interface Box {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DraftLine {
  text: string;
  // Nula en Word, Markdown y texto: ahí no hay hoja.
  box: Box | null;
}

export interface BlockDraft {
  type: BlockType;
  // El nivel de una sección (1, 2…); 0 en los demás bloques.
  level: number;
  // La página en un PDF; 1 en Word, Markdown y texto (el documento entero es una unidad).
  unit: number;
  lines: DraftLine[];
  // Un bloque de Markdown lleva marcas de énfasis («**media**») que la normalización saca.
  markup?: 'md' | undefined;
}

// Los bloques que tienen texto propio (todo menos figuras, encabezados y pies): lo que se cuenta
// como «párrafos» en Word, Markdown y texto.
export const TEXT_TYPES: readonly BlockType[] = [
  'section',
  'title',
  'paragraph',
  'list',
  'table',
  'formula',
  'code',
];

// Los bloques cuyos renglones se leen de corrido (un salto es un espacio).
export const FLOWING_TYPES: readonly BlockType[] = ['section', 'title', 'paragraph'];
