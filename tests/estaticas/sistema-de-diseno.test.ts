import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAPER_COLOR } from '../../src/core/theme';
import { contrastRatio, hsl, isRed } from '../apoyo/color';
import {
  colorTokens,
  declarations,
  plainTokens,
  RENDERER,
  rel,
  stripComments,
  styleFiles,
  TOKENS_FILE,
  walk,
} from '../apoyo/css';

// El sistema de diseño es un archivo de tokens (`src/renderer/tokens.css`) y nada más: ningún color,
// tamaño, espacio, radio ni tiempo se escribe fuera de él. Estas pruebas leen los archivos de
// estilos tal cual están y comprueban los valores exactos del plan de la Fase 06.

// Los colores del plan, en claro y en oscuro.
const COLORS: Record<string, [string, string]> = {
  papel: ['#f3f4f6', '#121419'],
  superficie: ['#ffffff', '#1a1d23'],
  'superficie-hundida': ['#e9ebef', '#0d0f13'],
  tinta: ['#15181d', '#eceef2'],
  'tinta-suave': ['#4d5461', '#a9afbb'],
  'tinta-tenue': ['#868c98', '#707684'],
  linea: ['#dadde3', '#2c3039'],
  'linea-fuerte': ['#7d8391', '#727989'],
  marca: ['#2443b3', '#93a8ff'],
  'marca-fuerte': ['#19317f', '#b9c7ff'],
  'marca-suave': ['#e5eafb', '#1e2849'],
  'sobre-marca': ['#ffffff', '#0d1533'],
  foco: ['#2443b3', '#b9c7ff'],
  correcta: ['#1d6a48', '#73d1a2'],
  'correcta-suave': ['#e1f0e8', '#14302a'],
  parcial: ['#885300', '#f2b660'],
  'parcial-suave': ['#faefd9', '#352810'],
  atencion: ['#a64512', '#ff9d66'],
  'atencion-suave': ['#fbe9df', '#3b2213'],
};

const tokens = colorTokens();
const plain = plainTokens();

describe('tokens de color', () => {
  it('tienen exactamente los 19 colores del plan, cada uno con su valor claro y su valor oscuro', () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(COLORS).sort());
    for (const [name, [light, dark]] of Object.entries(COLORS)) {
      expect(tokens[name], name).toEqual({ light, dark });
    }
  });

  it('[CA-037] no existe el rojo: ningún token de color, en claro ni en oscuro, se lee como rojo', () => {
    const reds = Object.entries(tokens).flatMap(([name, { light, dark }]) => [
      ...(isRed(light) ? [`${name} (claro) ${light}`] : []),
      ...(isRed(dark) ? [`${name} (oscuro) ${dark}`] : []),
    ]);
    expect(reds).toEqual([]);
  });

  it('[CA-037] «atención» es naranja, no rojo, y el control sabe distinguirlos', () => {
    expect(hsl(COLORS.atencion?.[0] ?? '#000000').hue).toBeGreaterThan(15);
    expect(isRed('#d32f2f')).toBe(true);
    expect(isRed('#ff0000')).toBe(true);
    expect(isRed('#2443b3')).toBe(false);
    expect(isRed('#a64512')).toBe(false);
  });

  it('el fondo con el que arranca la ventana es el papel de cada tema', () => {
    expect(PAPER_COLOR).toEqual({ light: tokens.papel?.light, dark: tokens.papel?.dark });
  });

  it('«Claro» y «Oscuro» fijan el esquema de color; sin elección lo decide el sistema', () => {
    const css = stripComments(readFileSync(TOKENS_FILE, 'utf8'));
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark;/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;/);
  });
});

describe('contraste', () => {
  type Pair = [text: string, background: string, minimum: number];
  // Texto (4,5 a 1) y bordes o íconos que se necesitan ver (3 a 1), con los pares que usan los
  // componentes de verdad.
  const PAIRS: Pair[] = [
    ['tinta', 'papel', 4.5],
    ['tinta', 'superficie', 4.5],
    ['tinta', 'superficie-hundida', 4.5],
    ['tinta', 'marca-suave', 4.5],
    ['tinta', 'correcta-suave', 4.5],
    ['tinta', 'parcial-suave', 4.5],
    ['tinta', 'atencion-suave', 4.5],
    ['tinta-suave', 'papel', 4.5],
    ['tinta-suave', 'superficie', 4.5],
    ['tinta-suave', 'superficie-hundida', 4.5],
    ['marca', 'papel', 4.5],
    ['marca', 'superficie', 4.5],
    ['marca', 'marca-suave', 4.5],
    ['marca-fuerte', 'marca-suave', 4.5],
    ['marca-fuerte', 'superficie', 4.5],
    ['sobre-marca', 'marca', 4.5],
    ['correcta', 'superficie', 4.5],
    ['correcta', 'correcta-suave', 4.5],
    ['parcial', 'superficie', 4.5],
    ['parcial', 'parcial-suave', 4.5],
    ['atencion', 'superficie', 4.5],
    ['atencion', 'atencion-suave', 4.5],
    ['linea-fuerte', 'papel', 3],
    ['linea-fuerte', 'superficie', 3],
    ['foco', 'papel', 3],
    ['foco', 'superficie', 3],
    ['foco', 'superficie-hundida', 3],
    ['tinta-tenue', 'superficie', 3],
  ];

  it.for(PAIRS)(
    '[CA-032] «%s» sobre «%s» tiene al menos %s a 1 en claro y en oscuro',
    ([text, background, minimum]) => {
      for (const theme of ['light', 'dark'] as const) {
        const ratio = contrastRatio(tokens[text]?.[theme] ?? '', tokens[background]?.[theme] ?? '');
        expect(ratio, `${text} sobre ${background}, ${theme}`).toBeGreaterThanOrEqual(minimum);
      }
    },
  );

  it('[CA-032] la tinta tenue no se usa nunca como color de texto: no alcanza el contraste de lectura', () => {
    const asText = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.property === 'color' && d.value.includes('tinta-tenue'));
    expect(asText).toEqual([]);
  });
});

describe('ningún color fuera de los tokens', () => {
  const COLOR_WORDS =
    /\b(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|gold|crimson|coral|salmon|tomato)\b/i;

  it('los estilos de la ventana solo usan colores de los tokens: sin #, rgb(), hsl() ni nombres de color', () => {
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter(
        (d) =>
          /#[0-9a-f]{3,8}\b/i.test(d.value) ||
          /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/i.test(d.value) ||
          COLOR_WORDS.test(d.value),
      )
      .map((d) => `${rel(d.file)}: ${d.property}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('el código de la ventana no escribe colores a mano', () => {
    const offenders = walk(RENDERER, ['.tsx', '.ts'])
      .filter((file) => !file.endsWith('globals.d.ts'))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return [...text.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\brgba?\(|\bhsla?\(/gi)].map(
          (match) => `${rel(file)}: ${match[0]}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it('todo `var(--...)` de los estilos existe en los tokens', () => {
    const defined = new Set(Object.keys(plain));
    const missing = styleFiles()
      .flatMap(declarations)
      .flatMap((d) =>
        [...d.value.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => ({ d, name: m[1] ?? '' })),
      )
      .filter(({ name }) => !defined.has(name))
      .map(({ d, name }) => `${rel(d.file)}: ${d.property} usa --${name}, que no existe`);
    expect(missing).toEqual([]);
  });

  it('no queda ningún nombre de variable de antes del sistema de diseño', () => {
    const old = styleFiles()
      .flatMap(declarations)
      .filter((d) => /--color-(fondo|borde|primario|aviso|cinta)/.test(d.value))
      .map((d) => `${rel(d.file)}: ${d.value}`);
    expect(old).toEqual([]);
  });
});

describe('escala de letra, espacio y forma', () => {
  it('la escala de letra es la del plan, con peso, tamaño y alto exactos', () => {
    const scale: Record<string, string> = {
      'tipo-display': '700 34px/40px var(--fuente-titulos)',
      'tipo-titulo': '650 24px/30px var(--fuente-titulos)',
      'tipo-subtitulo': '600 18px/26px var(--fuente-titulos)',
      'tipo-consigna': '400 20px/30px var(--fuente-texto)',
      'tipo-cuerpo': '400 16px/26px var(--fuente-texto)',
      'tipo-cuerpo-fuerte': '600 16px/26px var(--fuente-texto)',
      'tipo-pequeno': '400 14px/20px var(--fuente-texto)',
      'tipo-rotulo': '700 12px/16px var(--fuente-texto)',
      'tipo-codigo': '400 14px/22px var(--fuente-codigo)',
    };
    for (const [name, value] of Object.entries(scale)) {
      // Biome escribe «34px / 40px»: el plan dice 34/40.
      expect(plain[name]?.replace(/\s*\/\s*/g, '/'), name).toBe(value);
    }
    expect(plain['rotulo-espaciado']).toBe('0.06em');
    expect(plain['ancho-lectura']).toBe('68ch');
  });

  it('el rótulo va en mayúsculas con el espaciado del plan', () => {
    const rotulos = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.property === 'font' && d.value === 'var(--tipo-rotulo)');
    expect(rotulos.length).toBeGreaterThan(3);
    for (const css of styleFiles()) {
      const text = stripComments(readFileSync(css, 'utf8'));
      for (const block of text.split('}')) {
        if (block.includes('var(--tipo-rotulo)')) {
          expect(block, rel(css)).toMatch(/letter-spacing:\s*var\(--rotulo-espaciado\)/);
          expect(block, rel(css)).toMatch(/text-transform:\s*uppercase/);
        }
      }
    }
  });

  it('las tipografías son Bricolage Grotesque (títulos), Atkinson Hyperlegible Next (texto) y Atkinson Hyperlegible Mono (código)', () => {
    expect(plain['fuente-titulos']).toMatch(/^"Bricolage Grotesque"/);
    expect(plain['fuente-texto']).toMatch(/^"Atkinson Hyperlegible Next"/);
    expect(plain['fuente-codigo']).toMatch(/^"Atkinson Hyperlegible Mono"/);
  });

  it('las tipografías viajan como archivos locales: cada fuente declarada existe, sin direcciones de internet', () => {
    const css = readFileSync(join(RENDERER, 'fonts', 'fonts.css'), 'utf8');
    const sources = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1] ?? '');
    expect(sources.length).toBe(5);
    for (const source of sources) {
      expect(source).not.toMatch(/^[a-z]+:/i);
      expect(existsSync(join(RENDERER, 'fonts', source)), source).toBe(true);
    }
    expect(css).not.toMatch(/https?:/);
    for (const family of [
      'Bricolage Grotesque',
      'Atkinson Hyperlegible Next',
      'Atkinson Hyperlegible Mono',
    ]) {
      expect(css).toContain(`font-family: "${family}"`);
    }
    expect(existsSync(join(RENDERER, 'fonts', 'LICENSES.md'))).toBe(true);
  });

  it('el espacio va en grilla de 4 píxeles: 4, 8, 12, 16, 24, 32 y 48', () => {
    expect(
      [
        'espacio-4',
        'espacio-8',
        'espacio-12',
        'espacio-16',
        'espacio-24',
        'espacio-32',
        'espacio-48',
      ].map((name) => plain[name]),
    ).toEqual(['4px', '8px', '12px', '16px', '24px', '32px', '48px']);
    expect(Object.keys(plain).filter((name) => name.startsWith('espacio-'))).toHaveLength(7);
  });

  it('todo margen, relleno y separación de los estilos sale de esa grilla (o es cero, automático o el recorte de texto oculto)', () => {
    const spacing =
      /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/;
    const allowed =
      /^(0|auto|-1px|var\(--espacio-(4|8|12|16|24|32|48)\)|calc\(-1 \* var\(--espacio-(4|8|12|16|24|32|48)\)\))$/;
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter((d) => spacing.test(d.property))
      .flatMap((d) => d.value.split(/\s+/).map((part) => ({ d, part })))
      .filter(({ part }) => !allowed.test(part))
      .map(({ d, part }) => `${rel(d.file)}: ${d.property}: ${d.value} («${part}»)`);
    expect(offenders).toEqual([]);
  });

  it('los radios son 4, 8, 14 y píldora, y todo radio de los estilos sale de ahí', () => {
    expect([plain['radio-4'], plain['radio-8'], plain['radio-14'], plain['radio-pildora']]).toEqual(
      ['4px', '8px', '14px', '999px'],
    );
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter(
        (d) => d.property === 'border-radius' && !/^var\(--radio-(4|8|14|pildora)\)$/.test(d.value),
      )
      .map((d) => `${rel(d.file)}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('los controles miden 40 píxeles de alto', () => {
    expect(plain['alto-control']).toBe('40px');
  });

  it('el tamaño de letra de los estilos sale de la escala: nadie escribe un `font-size` a mano', () => {
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter(
        (d) =>
          d.property === 'font-size' ||
          d.property === 'line-height' ||
          (d.property === 'font' &&
            !/^var\(--tipo-[a-z-]+\)$/.test(d.value) &&
            d.value !== 'inherit'),
      )
      .map((d) => `${rel(d.file)}: ${d.property}: ${d.value}`);
    expect(offenders).toEqual([]);
  });
});

describe('trazo, foco, sombra y movimiento', () => {
  it('el trazo lleno es de 1,5 píxeles y el punteado, también', () => {
    expect(plain['trazo-ancho']).toBe('1.5px');
    expect(plain['trazo-lleno']).toBe('var(--trazo-ancho) solid');
    expect(plain['trazo-punteado']).toBe('var(--trazo-ancho) dashed');
  });

  it('toda pieza marcada con trazo punteado se dibuja con borde punteado, y la llena, con borde lleno', () => {
    // El estilo de cada componente dice `border-style: dashed` para `data-stroke="dashed"`.
    const withStroke = styleFiles().filter((file) =>
      readFileSync(file, 'utf8').includes('data-stroke="dashed"'),
    );
    expect(withStroke.length).toBeGreaterThanOrEqual(6);
    for (const file of withStroke) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const block of text.split('}')) {
        // Las reglas que solo pintan un relleno (los escalones llenos) no dibujan borde.
        if (block.includes('data-stroke="dashed"') && !block.includes('[data-filled')) {
          expect(block, rel(file)).toMatch(/border-style:\s*dashed/);
        }
      }
    }
  });

  it('el foco es un contorno de 2 píxeles con 2 de separación, siempre visible: nadie lo apaga', () => {
    expect(plain['foco-ancho']).toBe('2px');
    expect(plain['foco-separacion']).toBe('2px');
    const css = stripComments(readFileSync(TOKENS_FILE, 'utf8'));
    expect(css).toMatch(
      /:focus-visible\s*\{\s*outline:\s*var\(--foco-ancho\) solid var\(--color-foco\);\s*outline-offset:\s*var\(--foco-separacion\);/,
    );
    const offenders = [...styleFiles(), TOKENS_FILE]
      .flatMap(declarations)
      .filter((d) => d.property === 'outline' && /^(none|0)\b/.test(d.value))
      .map((d) => `${rel(d.file)}: outline: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('hay sombra leve para las tarjetas y marcada solo para lo que flota (el diálogo)', () => {
    expect(plain['sombra-tarjeta']).toBeTruthy();
    expect(plain['sombra-flotante']).toBeTruthy();
    const usersOfFloating = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.value.includes('--sombra-flotante'))
      .map((d) => rel(d.file));
    expect(usersOfFloating).toEqual(['src/renderer/ui/Frame.module.css']);
  });

  it('el movimiento es de 120 y 200 milisegundos, sin rebotes, y «reducir movimiento» lo apaga', () => {
    expect(plain['movimiento-rapido']).toBe('120ms');
    expect(plain['movimiento-normal']).toBe('200ms');
    // Una curva sin rebote no se pasa de 0 a 1 en el eje del progreso.
    const curve =
      /cubic-bezier\(([^)]+)\)/
        .exec(plain.curva ?? '')?.[1]
        ?.split(',')
        .map(Number) ?? [];
    expect(curve).toHaveLength(4);
    expect(curve[1]).toBeGreaterThanOrEqual(0);
    expect(curve[3]).toBeLessThanOrEqual(1);
    expect(curve[1]).toBeLessThanOrEqual(1);
    const css = stripComments(readFileSync(TOKENS_FILE, 'utf8'));
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--movimiento-rapido:\s*0ms;\s*--movimiento-normal:\s*0ms;/,
    );
    // Todo movimiento de los estilos usa esos dos tiempos.
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.property === 'transition' || d.property === 'animation')
      .filter((d) => /\b\d+(\.\d+)?m?s\b/.test(d.value))
      .map((d) => `${rel(d.file)}: ${d.value}`);
    expect(offenders).toEqual([]);
  });
});

describe('detalles de letra y contorno', () => {
  it('el peso de letra de los estilos es uno de la escala (400, 600, 650 o 700)', () => {
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.property === 'font-weight' && !/^(400|600|650|700)$/.test(d.value))
      .map((d) => `${rel(d.file)}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('el espaciado entre letras de los estilos es solo el del rótulo', () => {
    const offenders = styleFiles()
      .flatMap(declarations)
      .filter((d) => d.property === 'letter-spacing' && d.value !== 'var(--rotulo-espaciado)')
      .map((d) => `${rel(d.file)}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('nadie saca el contorno con `outline-style` ni `outline-width`', () => {
    const offenders = [...styleFiles(), TOKENS_FILE]
      .flatMap(declarations)
      .filter(
        (d) =>
          (d.property === 'outline-style' && d.value === 'none') ||
          (d.property === 'outline-width' && /^0/.test(d.value)),
      )
      .map((d) => `${rel(d.file)}: ${d.property}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it('todo token que se define se usa (o es uno de los del plan)', () => {
    const planned =
      /^(color-|fuente-|tipo-|espacio-|radio-|trazo-|foco-|movimiento-|sombra-|ancho-|alto-|rotulo-|curva)/;
    const used = new Set(
      [...styleFiles(), TOKENS_FILE]
        .flatMap(declarations)
        .flatMap((d) => [...d.value.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1] ?? '')),
    );
    const orphans = Object.keys(plain).filter((name) => planned.test(name) && !used.has(name));
    // Los colores, la escala y la grilla son del plan aunque hoy no se use cada uno; lo demás tiene
    // que estar en uso.
    expect(orphans.filter((name) => !/^(color-|tipo-|espacio-|radio-)/.test(name))).toEqual([]);
  });
});
