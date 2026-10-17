// Lo que no puede aparecer en ninguna pantalla: valores técnicos a la vista (CA-036), texto de
// relleno, inglés suelto, las palabras que prohíbe el CLAUDE.md, las frases que prohíbe
// `no-funcionales.md`, el tuteo y los emojis. Es la única regla: la usan el catálogo de textos,
// las pruebas de cada pantalla y la punta a punta.

type TextRule =
  | 'valor-tecnico'
  | 'relleno'
  | 'palabra-prohibida'
  | 'frase-prohibida'
  | 'tuteo'
  | 'emoji'
  | 'ingles-suelto';

export interface TextProblem {
  rule: TextRule;
  found: string;
}

// `\b` de JavaScript no reconoce las letras con tilde: se usan límites que miran cualquier letra.
const word = (alternatives: string) => `(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`;

// Sensible a mayúsculas: «NaN» y «null» como los escribe un programa, no «nulo» ni «Nan».
const TECHNICAL = new RegExp(`${word('undefined|null|NaN')}|\\[object Object\\]`, 'gu');
const FILLER = /lorem\s+ipsum/giu;
const FORBIDDEN_WORDS = new RegExp(
  word('racha|rachas|dominado|dominada|dominados|dominadas|deuda|deudas|backlog'),
  'giu',
);
const FORBIDDEN_PHRASES = /te\s+extrañamos|perdiste/giu;
const TUTEO = new RegExp(
  word('tú|tienes|puedes|quieres|escribe|pulsa|haz|elige|selecciona|introduce|guarda'),
  'giu',
);
const EMOJI = /\p{Extended_Pictographic}/gu;
// Palabras que solo existen en inglés (las que se escapan de una pantalla sin traducir).
const ENGLISH = new RegExp(
  word(
    [
      'the',
      'and',
      'with',
      'from',
      'loading',
      'click',
      'please',
      'save',
      'cancel',
      'delete',
      'submit',
      'settings',
      'search',
      'next',
      'previous',
      'back',
      'home',
      'welcome',
      'hello',
      'failed',
      'success',
      'warning',
      'retry',
      'undo',
      'redo',
      'open',
      'close',
      'new',
      'edit',
      'add',
      'remove',
      'upload',
      'download',
      'login',
      'logout',
      'help',
      'about',
      'true',
      'false',
      'your',
      'you',
      'review',
      'card',
      'cards',
      'session',
      'study',
      'start',
      'finish',
      'continue',
      'skip',
    ].join('|'),
  ),
  'giu',
);

// Las reglas en el orden en que se informan. El inglés se puede dejar pasar cuando el texto es
// contenido de estudio en inglés (una frase para decir en voz alta).
const RULES: readonly { rule: TextRule; pattern: RegExp; english?: true }[] = [
  { rule: 'valor-tecnico', pattern: TECHNICAL },
  { rule: 'relleno', pattern: FILLER },
  { rule: 'palabra-prohibida', pattern: FORBIDDEN_WORDS },
  { rule: 'frase-prohibida', pattern: FORBIDDEN_PHRASES },
  { rule: 'tuteo', pattern: TUTEO },
  { rule: 'emoji', pattern: EMOJI },
  { rule: 'ingles-suelto', pattern: ENGLISH, english: true },
];

// Los problemas de un texto, uno por cada cosa distinta que encuentra, con lo que encontró.
export function findTextProblems(
  text: string,
  options: { allowEnglish?: boolean } = {},
): TextProblem[] {
  const problems: TextProblem[] = [];
  for (const { rule, pattern, english } of RULES) {
    if (english && options.allowEnglish) {
      continue;
    }
    const seen = new Set<string>();
    for (const match of text.matchAll(pattern)) {
      const found = match[0];
      if (!seen.has(found.toLowerCase())) {
        seen.add(found.toLowerCase());
        problems.push({ rule, found });
      }
    }
  }
  return problems;
}
