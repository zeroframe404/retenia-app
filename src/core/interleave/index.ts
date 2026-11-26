import { shuffle } from '../evaluation/random';

// El conjunto intercalado (CA-162): de 2 a 5 tipos de problema que se confunden, mezclados para que
// haya que elegir el método. Nunca dos seguidos del mismo tipo, ningún enunciado nombra un tipo,
// solo con tipos que ya practicaste por separado y nunca con materias mezcladas.

export interface ProblemType {
  readonly id: string;
  readonly name: string;
  readonly cardIds: readonly string[];
}

export interface SetItem {
  readonly cardId: string;
  readonly typeId: string;
}

export const MIN_TYPES = 2;
export const MAX_TYPES = 5;
// De cada tipo entran 3 como mucho: con media, mediana y moda, 9.
const PER_TYPE = 3;

// Palabras sin mayúsculas ni tildes (la ñ es una letra: su virgulilla, U+0303, se queda).
const wordsOf = (text: string): string[] =>
  text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/(?!̃)\p{M}/gu, '')
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

const phrase = (words: readonly string[]) => ` ${words.join(' ')} `;

// El primer nombre de tipo que aparece en el enunciado como palabra (o frase) entera.
export function statementNamesType(statement: string, names: readonly string[]): string | null {
  const text = phrase(wordsOf(statement));
  return (
    names.find((name) => {
      const words = wordsOf(name);
      return words.length > 0 && text.includes(phrase(words));
    }) ?? null
  );
}

export function eligibleTypes(
  types: readonly ProblemType[],
  practiced: ReadonlySet<string>,
): ProblemType[] {
  return types.filter((type) => type.cardIds.some((cardId) => practiced.has(cardId)));
}

export type SetProblem =
  | 'typeCount'
  | 'typeName'
  | 'repeatedName'
  | 'emptyType'
  | 'repeatedCard'
  | 'subjects'
  | 'namesType';

export function setProblems(
  types: readonly ProblemType[],
  cards: {
    // La materia y el enunciado de cada problema.
    readonly subjects: ReadonlyMap<string, string | null>;
    readonly statements: ReadonlyMap<string, string>;
  },
): SetProblem[] {
  const problems = new Set<SetProblem>();
  if (types.length < MIN_TYPES || types.length > MAX_TYPES) {
    problems.add('typeCount');
  }
  const names = types.map((type) => type.name);
  if (names.some((name) => wordsOf(name).length === 0)) {
    problems.add('typeName');
  }
  if (new Set(names.map((name) => phrase(wordsOf(name)))).size !== names.length) {
    problems.add('repeatedName');
  }
  if (types.some((type) => type.cardIds.length === 0)) {
    problems.add('emptyType');
  }
  const ids = types.flatMap((type) => type.cardIds);
  if (new Set(ids).size !== ids.length) {
    problems.add('repeatedCard');
  }
  if (new Set(ids.map((id) => cards.subjects.get(id) ?? null)).size > 1) {
    problems.add('subjects');
  }
  if (ids.some((id) => statementNamesType(cards.statements.get(id) ?? '', names) !== null)) {
    problems.add('namesType');
  }
  return [...problems];
}

// Un tipo con más problemas que todos los demás juntos más uno dejaría dos seguidos: se le sacan.
function balance(queues: readonly { cards: string[] }[]): void {
  const total = queues.reduce((sum, queue) => sum + queue.cards.length, 0);
  const excess = queues.find((queue) => queue.cards.length > total - queue.cards.length + 1);
  if (queues.length > 1 && excess) {
    excess.cards.pop();
    balance(queues);
  }
}

// Los problemas del conjunto, en orden. Con la misma semilla sale lo mismo.
export function buildInterleavedSet(types: readonly ProblemType[], seed: string): SetItem[] {
  const queues = types
    .map((type) => ({
      typeId: type.id,
      cards: shuffle(type.cardIds, `${seed}:${type.id}`).slice(0, PER_TYPE),
    }))
    .filter((queue) => queue.cards.length > 0);
  balance(queues);
  const result: SetItem[] = [];
  let last: string | null = null;
  for (;;) {
    const left = queues.reduce((sum, queue) => sum + queue.cards.length, 0);
    const open = queues.filter((queue) => queue.cards.length > 0 && queue.typeId !== last);
    // Si un tipo ya ocupa la mitad (para arriba) de lo que queda, tiene que ir ahora.
    const next =
      open.find((queue) => queue.cards.length * 2 > left) ??
      shuffle(open, `${seed}:${result.length}`)[0];
    const cardId = next?.cards.shift();
    if (next === undefined || cardId === undefined) {
      return result;
    }
    result.push({ typeId: next.typeId, cardId });
    last = next.typeId;
  }
}
