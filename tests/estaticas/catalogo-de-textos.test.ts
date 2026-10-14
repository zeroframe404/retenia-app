import { describe, expect, it } from 'vitest';
import { demoTexts } from '../../src/preload/contract/demo-texts';
import { texts } from '../../src/preload/contract/texts';

// El catálogo es el único lugar de los textos visibles (CLAUDE.md, secciones g y «Reglas del
// producto»): castellano rioplatense con voseo, vocabulario del sistema, sin emojis y sin
// textos técnicos. Cada función del catálogo se prueba con los argumentos de ejemplo de acá
// abajo; una función nueva sin ejemplo hace fallar la prueba.
const SAMPLES: Record<string, unknown[]> = {
  'texts.cards.questionTooLong': [100000],
  'texts.cards.answerTooLong': [100000],
  'texts.cards.nextReview': ['miércoles 17/03/2027'],
  'demoTexts.ribbon': ['lunes 15/03/2027'],
};

function collect(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (typeof value === 'function') {
    const args = SAMPLES[path];
    if (!args) {
      throw new Error(`El texto ${path} es una función y falta su ejemplo en SAMPLES`);
    }
    out.push({ path, text: String((value as (...a: unknown[]) => unknown)(...args)) });
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      collect(inner, `${path}.${key}`, out);
    }
  }
}

const entries: { path: string; text: string }[] = [];
collect(texts, 'texts', entries);
collect(demoTexts, 'demoTexts', entries);

const FORBIDDEN_WORDS =
  /\b(racha|rachas|dominado|dominada|dominados|dominadas|deuda|deudas|backlog)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
// Tuteo y jerga que no van en pantalla.
const TUTEO = /\b(tú|tienes|puedes|quieres|escribe|pulsa|haz|elige|selecciona|introduce|guarda)\b/i;
const TECHNICAL =
  /\b(undefined|null|NaN|SQLite|Zod|IPC|stack|exception|excepción|Error:|TypeError|payload|token|JSON|API)\b|\[object/;

describe('catálogo de textos', () => {
  it('tiene textos', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.for(entries)(
    '$path no usa palabras prohibidas, emojis, tuteo ni jerga técnica',
    ({ text }) => {
      expect(text.trim(), 'texto vacío').not.toBe('');
      expect(text).not.toMatch(FORBIDDEN_WORDS);
      expect(text).not.toMatch(EMOJI);
      expect(text).not.toMatch(TUTEO);
      expect(text).not.toMatch(TECHNICAL);
    },
  );

  it('los textos de la Fase 03 son exactamente los del plan', () => {
    expect(texts.cards.title).toBe('Tarjetas');
    expect(texts.cards.newCard).toBe('Nueva tarjeta');
    expect(texts.cards.questionLabel).toBe('Pregunta');
    expect(texts.cards.answerLabel).toBe('Respuesta');
    expect(texts.cards.save).toBe('Guardar');
    expect(texts.cards.saved).toBe('Tarjeta guardada');
    expect(texts.cards.questionRequired).toBe('Escribí la pregunta');
    expect(texts.cards.review).toBe('Repasar');
    expect(texts.cards.showAnswer).toBe('Mostrar respuesta');
    expect(texts.cards.gradeAgain).toBe('No la sabía');
    expect(texts.cards.gradeHard).toBe('Con dudas');
    expect(texts.cards.gradeGood).toBe('La sabía');
    expect(texts.cards.nextReview('miércoles 17/03/2027')).toBe(
      'Próximo repaso: miércoles 17/03/2027',
    );
    expect(demoTexts.ribbon('lunes 15/03/2027')).toBe('DEMOSTRACIÓN · hoy es lunes 15/03/2027');
  });
});
