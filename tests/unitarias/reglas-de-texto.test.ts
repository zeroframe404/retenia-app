import { describe, expect, it } from 'vitest';
import { findTextProblems } from '../../src/core/text-rules';

// Lo que no puede aparecer en ninguna pantalla (CA-036), las palabras que prohíbe el CLAUDE.md
// y las formas que prohíben `no-funcionales.md` y el glosario. Una sola regla para el catálogo
// de textos, para cada pantalla de las pruebas de componentes y para la punta a punta.

const rules = (text: string, options?: { allowEnglish?: boolean }) =>
  findTextProblems(text, options).map((problem) => problem.rule);

describe('textos prohibidos', () => {
  it.for(['undefined', 'null', 'NaN', '[object Object]', 'Tenés null tarjetas', 'Hay NaN días'])(
    '[CA-036] «%s» es un valor técnico a la vista',
    (text) => {
      expect(rules(text)).toContain('valor-tecnico');
    },
  );

  it.for(['Lorem ipsum dolor sit amet', 'lorem ipsum', 'Texto de ejemplo: Lorem Ipsum'])(
    '[CA-036] «%s» es texto de relleno',
    (text) => {
      expect(rules(text)).toContain('relleno');
    },
  );

  it.for([
    'Loading…',
    'Click here to continue',
    'Settings',
    'Save',
    'Delete this card',
    'Please wait',
    'The answer',
  ])('[CA-036] «%s» es inglés suelto', (text) => {
    expect(rules(text)).toContain('ingles-suelto');
  });

  it('[CA-036] el inglés del contenido de estudio se deja pasar cuando se pide', () => {
    expect(rules('The weather is nice today', { allowEnglish: true })).toEqual([]);
    expect(rules('The weather is nice today')).toContain('ingles-suelto');
  });

  it.for([
    'Cancelar',
    'Guardar',
    'No pude cargar tus tarjetas. Probá de nuevo.',
    'Todavía no disponible',
    'Ajustes',
    'Sesión terminada · 13 min',
    'Próximo repaso: miércoles 17/03/2027',
    '¿Qué mide el desvío estándar?',
    'Entendí: “good morning”',
    'Todo en orden · 0 diferencias',
  ])('[CA-036] «%s» es castellano y no marca nada', (text) => {
    expect(rules(text)).toEqual([]);
  });

  it.for([
    'Tu racha de 5 días',
    'Rachas',
    'Tema dominado',
    'Materia dominada',
    'Tenés una deuda de repasos',
    'Deudas',
    'Backlog de tarjetas',
  ])('[CA-036] «%s» usa una de las cuatro palabras prohibidas', (text) => {
    expect(rules(text)).toContain('palabra-prohibida');
  });

  it.for(['Te extrañamos', 'Perdiste tu avance', 'te extrañamos mucho'])(
    '«%s» es una frase prohibida',
    (text) => {
      expect(rules(text)).toContain('frase-prohibida');
    },
  );

  it.for(['Tú puedes elegir', 'Escribe tu respuesta', 'Pulsa el botón', 'Haz clic'])(
    '«%s» es tuteo',
    (text) => {
      expect(rules(text)).toContain('tuteo');
    },
  );

  it('un emoji se detecta', () => {
    expect(rules('Muy bien 🙂')).toContain('emoji');
  });

  it('una palabra que solo contiene a una prohibida no marca nada', () => {
    expect(rules('Los dominadores del tiempo')).toEqual([]);
    expect(rules('anulado')).toEqual([]);
  });

  it('cuenta cada problema una sola vez y dice qué encontró', () => {
    expect(findTextProblems('undefined undefined')).toEqual([
      { rule: 'valor-tecnico', found: 'undefined' },
    ]);
    expect(findTextProblems('Tu racha: null')).toEqual([
      { rule: 'valor-tecnico', found: 'null' },
      { rule: 'palabra-prohibida', found: 'racha' },
    ]);
  });
});
