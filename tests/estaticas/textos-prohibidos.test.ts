import { readFileSync } from 'node:fs';
import { parseSync } from '@swc/core';
import { describe, expect, it } from 'vitest';
import { findTextProblems } from '../../src/core/text-rules';
import { catalogEntries } from '../apoyo/catalogo';
import { RENDERER, rel, walk } from '../apoyo/css';

// El barrido de textos (CA-036): el catálogo es el único lugar de los textos visibles, y nada de
// lo que contiene puede mostrar «undefined», «null», «NaN», «[object Object]», inglés suelto ni
// texto de relleno, ni usar las palabras que prohíbe el CLAUDE.md (racha, dominado, deuda,
// backlog), ni tutear. Las pantallas armadas se barren en la capa de componentes y en la punta a
// punta; acá, el catálogo y el código de la ventana.

const entries = catalogEntries();

describe('barrido del catálogo de textos', () => {
  it('[CA-036] recorre el catálogo entero: textos de la ventana, del principal y de la demostración', () => {
    const paths = new Set(entries.map((entry) => entry.path.split('.').slice(0, 2).join('.')));
    for (const section of [
      'texts.nav',
      'texts.screens',
      'texts.notes',
      'texts.search',
      'texts.appearance',
      'texts.ui',
      'texts.cards',
      'demoTexts.gallery',
      'demoTexts.lab',
    ]) {
      expect(paths.has(section), section).toBe(true);
    }
    expect(entries.length).toBeGreaterThan(300);
  });

  it.for(entries)(
    '[CA-036] $path no tiene valores técnicos, relleno, inglés suelto, palabras prohibidas ni tuteo',
    ({ text }) => {
      expect(findTextProblems(text)).toEqual([]);
    },
  );

  it('[CA-036] el barrido sabe encontrar lo que busca: un texto con problemas del catálogo se marca', () => {
    expect(findTextProblems('Tu racha: undefined').map((problem) => problem.rule)).toEqual([
      'valor-tecnico',
      'palabra-prohibida',
    ]);
  });

  it('las cuatro palabras prohibidas no aparecen en ningún texto, ni siquiera dentro de otra palabra del vocabulario', () => {
    const all = entries.map((entry) => entry.text).join('\n');
    expect(all).not.toMatch(/\b(racha|dominad[oa]s?|deudas?|backlog)\b/i);
  });
});

// Todo lo que se arma en JSX y se ve en pantalla: el texto suelto entre etiquetas y los atributos
// que se leen en voz alta.
const READ_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description']);

type Node = { type?: string; [key: string]: unknown };

function visit(node: unknown, callback: (node: Node, skip: boolean) => void, skip = false): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      visit(item, callback, skip);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  const current = node as Node;
  callback(current, skip);
  const quiet =
    skip ||
    current.type === 'ImportDeclaration' ||
    (current.type === 'CallExpression' &&
      JSON.stringify((current.callee as Node)?.object ?? '').includes('"value":"console"')) ||
    (current.type === 'NewExpression' &&
      JSON.stringify(current.callee ?? '').includes('"value":"Error"'));
  for (const [key, value] of Object.entries(current)) {
    if (key !== 'span') {
      visit(value, callback, quiet);
    }
  }
}

// Los archivos de la ventana, con y sin JSX: un texto escrito a mano en un `.ts` también cuenta.
const sources = walk(RENDERER, ['.tsx', '.ts']).filter((file) => !file.endsWith('globals.d.ts'));

// Lo que un archivo de la ventana tiene escrito a mano en lugar de sacarlo del catálogo.
function findHardcodedText(source: string): string[] {
  const ast = parseSync(source, { syntax: 'typescript', tsx: true });
  const found: string[] = [];
  visit(ast, (node, skip) => {
    if (skip) {
      return;
    }
    if (node.type === 'JSXText' && /\p{L}/u.test(String(node.value))) {
      found.push(`texto suelto «${String(node.value).trim()}»`);
    }
    if (node.type === 'JSXAttribute') {
      const name = String((node.name as Node | undefined)?.value);
      const value = node.value as Node | undefined;
      if (value?.type === 'StringLiteral') {
        const text = String(value.value);
        // Las etiquetas que lee el lector de pantalla y cualquier propiedad con una frase (con
        // espacios o letras con tilde): `legend="Tema de la interfaz"`.
        if (
          READ_ATTRIBUTES.has(name) ||
          (name !== 'className' && /[\s¿¡áéíóúñÁÉÍÓÚÑ]/.test(text))
        ) {
          found.push(`${name}="${text}"`);
        }
      }
    }
    // Un texto entre llaves: `{'Guardar'}` o una plantilla con letras.
    if (node.type === 'JSXElement') {
      for (const child of (node.children as Node[] | undefined) ?? []) {
        const expression =
          child.type === 'JSXExpressionContainer' ? (child.expression as Node) : null;
        let literal = '';
        if (expression?.type === 'StringLiteral') {
          literal = String(expression.value);
        } else if (expression?.type === 'TemplateLiteral') {
          literal = ((expression.quasis as { raw: string }[]) ?? [])
            .map((part) => part.raw)
            .join('');
        }
        if (/\p{L}/u.test(literal)) {
          found.push(`texto entre llaves «${literal}»`);
        }
      }
    }
    // Una frase escrita a mano (dos palabras de verdad seguidas) en una cadena de código.
    if (
      node.type === 'StringLiteral' &&
      /\p{L}{3,}\s+\p{L}{3,}/u.test(String(node.value)) &&
      !/[[\]=]|\/\//.test(String(node.value))
    ) {
      found.push(`frase escrita a mano «${String(node.value)}»`);
    }
  });
  return found;
}

describe('ningún componente lleva texto escrito adentro', () => {
  it('hay componentes para recorrer', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('[CA-036] el barrido sabe encontrar texto escrito a mano: lo marca en JSX, en etiquetas y en frases', () => {
    const found = findHardcodedText(`
      export function Malo() {
        const mensaje = 'Esto es una frase escrita';
        console.error('Esto no se ve y no cuenta');
        return (
          <section aria-label="Una etiqueta" title={texts.ok}>
            Hola mundo
            <button aria-hidden="true">{texts.ok}</button>
          </section>
        );
      }
    `);
    expect(found).toEqual([
      'frase escrita a mano «Esto es una frase escrita»',
      'aria-label="Una etiqueta"',
      'frase escrita a mano «Una etiqueta»',
      'texto suelto «Hola mundo»',
    ]);
  });

  it('[CA-036] también marca una propiedad con una frase, un texto entre llaves y una frase con dos puntos', () => {
    const found = findHardcodedText(`
      export const Malo = () => (
        <Grupo legend="Tema de la interfaz" size="small" className="a b">
          {'Guardar'}
          {\`Hola \${nombre}\`}
          {texts.ok}
        </Grupo>
      );
      export const aviso = 'Atención: algo falló';
    `);
    expect(found).toEqual([
      'texto entre llaves «Guardar»',
      'texto entre llaves «Hola »',
      'legend="Tema de la interfaz"',
      'frase escrita a mano «Atención: algo falló»',
    ]);
  });

  // El título nombra el componente sin extensión: el tablero no muestra nombres de archivos.
  it.for(
    sources.map((file) => ({
      file,
      name: rel(file)
        .replace(/^src\/renderer\//, '')
        .replace(/\.tsx$/, ''),
    })),
  )(
    '[CA-036] $name: todo texto sale del catálogo (ni texto suelto, ni etiquetas escritas a mano)',
    ({ file }) => {
      expect(findHardcodedText(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});
