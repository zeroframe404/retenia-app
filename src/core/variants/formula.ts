import { parseNumber } from '../evaluation/numeric';

// Las fórmulas de una familia de variantes (Fase 18, H-39): una cuenta con números (coma o punto),
// los nombres de los datos, + − × ÷ ^, paréntesis y unas pocas funciones. Se lee acá mismo, sin
// ejecutar código: lo que no es una cuenta se rechaza.

class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

const MAX_LENGTH = 500;
const MAX_DEPTH = 40;

interface Fn {
  readonly arity: readonly [number, number];
  readonly apply: (args: readonly number[]) => number;
}

const root: Fn = { arity: [1, 1], apply: ([x = 0]) => Math.sqrt(x) };

// Un Map, no un objeto: así «constructor» o «toString» no son funciones.
const FUNCTIONS: ReadonlyMap<string, Fn> = new Map<string, Fn>([
  ['raiz', root],
  ['raíz', root],
  ['sqrt', root],
  ['abs', { arity: [1, 1], apply: ([x = 0]) => Math.abs(x) }],
  [
    'redondear',
    {
      arity: [1, 2],
      apply: ([x = 0, digits = 0]) => {
        const factor = 10 ** Math.trunc(digits);
        return Math.round((x + Number.EPSILON * Math.sign(x)) * factor) / factor;
      },
    },
  ],
  ['min', { arity: [1, 20], apply: (args) => Math.min(...args) }],
  ['max', { arity: [1, 20], apply: (args) => Math.max(...args) }],
]);

export const FUNCTION_NAMES: ReadonlySet<string> = new Set(FUNCTIONS.keys());

type Token =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'symbol'; readonly symbol: string };

const SYMBOLS: ReadonlyMap<string, string> = new Map([
  ['+', '+'],
  ['-', '-'],
  ['−', '-'],
  ['*', '*'],
  ['×', '*'],
  ['·', '*'],
  ['/', '/'],
  ['÷', '/'],
  ['^', '^'],
  ['(', '('],
  [')', ')'],
  [';', ';'],
]);

export const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]*/u;
const NUMBER_PATTERN = /^[0-9]+(?:[.,][0-9]+)*/;

function tokenize(text: string): Token[] {
  if (text.length > MAX_LENGTH) {
    throw new FormulaError('La fórmula es demasiado larga');
  }
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/u.exec(rest)?.[0];
    if (space !== undefined) {
      at += space.length;
      continue;
    }
    const number = NUMBER_PATTERN.exec(rest)?.[0];
    if (number !== undefined) {
      // Como en las respuestas: coma o punto decimal y «1.500» es mil quinientos.
      const parsed = parseNumber(number);
      if (parsed === null) {
        throw new FormulaError(`No entiendo el número «${number}»`);
      }
      tokens.push({ kind: 'number', value: parsed.value });
      at += number.length;
      continue;
    }
    const name = NAME_PATTERN.exec(rest)?.[0];
    if (name !== undefined) {
      tokens.push({ kind: 'name', name });
      at += name.length;
      continue;
    }
    const symbol = SYMBOLS.get(rest.charAt(0));
    if (symbol === undefined) {
      throw new FormulaError(`No entiendo «${rest.charAt(0)}» en la fórmula`);
    }
    tokens.push({ kind: 'symbol', symbol });
    at += 1;
  }
  return tokens;
}

export function evaluateFormula(formula: string, values: Readonly<Record<string, number>>): number {
  const tokens = tokenize(formula);
  let at = 0;
  let depth = 0;

  const peekSymbol = () => {
    const token = tokens[at];
    return token?.kind === 'symbol' ? token.symbol : null;
  };
  const take = (symbol: string) => {
    if (peekSymbol() !== symbol) {
      throw new FormulaError(`Falta «${symbol}» en la fórmula`);
    }
    at += 1;
  };

  function expression(): number {
    depth += 1;
    if (depth > MAX_DEPTH) {
      throw new FormulaError('La fórmula tiene demasiados niveles');
    }
    let result = term();
    for (let op = peekSymbol(); op === '+' || op === '-'; op = peekSymbol()) {
      at += 1;
      const next = term();
      result = op === '+' ? result + next : result - next;
    }
    depth -= 1;
    return result;
  }

  function term(): number {
    let result = unary();
    for (let op = peekSymbol(); op === '*' || op === '/'; op = peekSymbol()) {
      at += 1;
      const next = unary();
      result = op === '*' ? result * next : result / next;
    }
    return result;
  }

  function unary(): number {
    const op = peekSymbol();
    if (op === '-' || op === '+') {
      at += 1;
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw new FormulaError('La fórmula tiene demasiados niveles');
      }
      const value = unary();
      depth -= 1;
      return op === '-' ? -value : value;
    }
    return power();
  }

  function power(): number {
    const base = primary();
    if (peekSymbol() !== '^') {
      return base;
    }
    at += 1;
    return base ** unary();
  }

  function primary(): number {
    const token = tokens[at];
    if (token === undefined) {
      throw new FormulaError('La fórmula está incompleta');
    }
    at += 1;
    if (token.kind === 'number') {
      return token.value;
    }
    if (token.kind === 'symbol') {
      if (token.symbol !== '(') {
        throw new FormulaError(`No esperaba «${token.symbol}»`);
      }
      const inner = expression();
      take(')');
      return inner;
    }
    if (peekSymbol() === '(') {
      const fn = FUNCTIONS.get(token.name);
      if (fn === undefined) {
        throw new FormulaError(`No conozco la función «${token.name}»`);
      }
      take('(');
      const args = [expression()];
      while (peekSymbol() === ';') {
        at += 1;
        args.push(expression());
      }
      take(')');
      const [least, most] = fn.arity;
      if (args.length < least || args.length > most) {
        throw new FormulaError(`«${token.name}» no recibe esa cantidad de números`);
      }
      return fn.apply(args);
    }
    const value = Object.hasOwn(values, token.name) ? values[token.name] : undefined;
    if (value === undefined) {
      throw new FormulaError(`No conozco el dato «${token.name}»`);
    }
    return value;
  }

  const result = expression();
  if (at !== tokens.length) {
    throw new FormulaError('Sobra algo en la fórmula');
  }
  if (!Number.isFinite(result)) {
    throw new FormulaError('La fórmula no da un número');
  }
  return result;
}
