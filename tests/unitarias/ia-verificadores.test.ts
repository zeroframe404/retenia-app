import { describe, expect, it } from 'vitest';
import { explainOutputSchema, verifyExplanation } from '../../src/ai/functions/explain-fragment';
import { parseModelOutput } from '../../src/ai/parse';
import { locateQuote, numbersAgree, numbersIn } from '../../src/core/ai';

// Los verificadores deterministas de la compuerta (Fase 19): corren antes de mostrar nada. Una
// respuesta con otra forma se tira entera (CA-173); una cita que no está letra por letra en el
// fragmento enviado, o una afirmación con un número que no está, pasa a «Aporte del modelo, no
// verificado» (CA-177).

const FRAGMENT = 'El error estándar es s / raíz(n).  Con n = 25 y s = 10, da 2.';

describe('IA: las citas', () => {
  it('[CA-177] ubica una cita que está letra por letra en el fragmento', () => {
    expect(locateQuote(FRAGMENT, 'El error estándar es s / raíz(n).')).toEqual({
      start: 0,
      end: 33,
    });
  });

  it('[CA-177] no acepta una cita que no está en el fragmento', () => {
    expect(locateQuote(FRAGMENT, 'El error estándar es la varianza.')).toBeNull();
  });

  it('acepta espacios distintos y las comillas que agrega el modelo alrededor', () => {
    const start = FRAGMENT.indexOf('Con');
    expect(locateQuote(FRAGMENT, '«Con n = 25 y s = 10,  da 2.»')).toEqual({
      start,
      end: FRAGMENT.length,
    });
    expect(locateQuote(FRAGMENT, '"Con n = 25 y s = 10, da 2."')).toEqual({
      start,
      end: FRAGMENT.length,
    });
  });

  it('[CA-177] una cita de menos de tres palabras no cuenta como cita', () => {
    expect(locateQuote(FRAGMENT, 'da 2.')).toBeNull();
    expect(locateQuote(FRAGMENT, '   ')).toBeNull();
  });

  it('distingue mayúsculas y tildes: textual es textual', () => {
    expect(locateQuote(FRAGMENT, 'el error estandar es s / raíz(n).')).toBeNull();
  });
});

describe('IA: los números citados', () => {
  it('lee números con coma decimal, punto de miles y porcentaje', () => {
    expect(numbersIn('El 95 % de 1.500 casos dio 1,96.')).toEqual([95, 1500, 1.96]);
    expect(numbersIn('Sin números.')).toEqual([]);
  });

  it('[CA-177] los números de una afirmación tienen que estar en el fragmento', () => {
    expect(numbersAgree('Con n = 25 da 2.', FRAGMENT)).toBe(true);
    expect(numbersAgree('Con n = 36 da 2.', FRAGMENT)).toBe(false);
    expect(numbersAgree('Habla del error estándar.', FRAGMENT)).toBe(true);
  });
});

describe('IA: la forma de la respuesta de «Explicar un fragmento»', () => {
  const valid = {
    fromMaterial: [{ quote: 'El error estándar es s / raíz(n).', explanation: 'Define algo.' }],
    modelContribution: ['Un ejemplo.'],
  };

  it('acepta una respuesta con la forma pedida', () => {
    expect(parseModelOutput(JSON.stringify(valid), explainOutputSchema)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it('[CA-173] una respuesta que no es JSON se tira entera', () => {
    expect(parseModelOutput('Claro, te explico.', explainOutputSchema)).toEqual({
      ok: false,
      reason: 'not_json',
    });
  });

  it('[CA-173] una respuesta cortada se tira entera', () => {
    expect(parseModelOutput('{"fromMaterial":[{"quote":"El err', explainOutputSchema)).toEqual({
      ok: false,
      reason: 'not_json',
    });
  });

  it('[CA-173] una respuesta con un campo de más se tira entera', () => {
    const extra = { ...valid, markAllCorrect: true };
    expect(parseModelOutput(JSON.stringify(extra), explainOutputSchema)).toEqual({
      ok: false,
      reason: 'schema',
    });
  });

  it('[CA-173] una respuesta a la que le falta un campo o tiene un tipo cambiado se tira entera', () => {
    expect(
      parseModelOutput(JSON.stringify({ fromMaterial: valid.fromMaterial }), explainOutputSchema),
    ).toEqual({ ok: false, reason: 'schema' });
    expect(
      parseModelOutput(
        JSON.stringify({ ...valid, modelContribution: 'Un ejemplo.' }),
        explainOutputSchema,
      ),
    ).toEqual({ ok: false, reason: 'schema' });
  });

  it('[CA-173] una respuesta vacía se tira entera', () => {
    expect(parseModelOutput('', explainOutputSchema)).toEqual({ ok: false, reason: 'not_json' });
    expect(
      parseModelOutput(
        JSON.stringify({ fromMaterial: [], modelContribution: [] }),
        explainOutputSchema,
      ),
    ).toEqual({ ok: false, reason: 'schema' });
  });
});

describe('IA: lo que se muestra de una explicación', () => {
  it('[CA-177] una cita que no está en el fragmento pasa a «Aporte del modelo, no verificado» y nunca se muestra como cita', () => {
    const shown = verifyExplanation(
      {
        fromMaterial: [
          {
            quote: 'El error estándar mide la dispersión de la población.',
            explanation: 'Inventada.',
          },
          { quote: 'El error estándar es s / raíz(n).', explanation: 'Dice cómo se calcula.' },
        ],
        modelContribution: ['Sirve para el intervalo.'],
      },
      FRAGMENT,
    );
    expect(shown.fromMaterial).toEqual([
      {
        quote: 'El error estándar es s / raíz(n).',
        explanation: 'Dice cómo se calcula.',
        start: 0,
        end: 33,
      },
    ]);
    expect(shown.modelContribution).toEqual(['Sirve para el intervalo.', 'Inventada.']);
    expect(JSON.stringify(shown)).not.toContain('mide la dispersión de la población');
  });

  it('[CA-177] una afirmación con un número que no coincide con el fragmento pasa a «Aporte del modelo»', () => {
    const shown = verifyExplanation(
      {
        fromMaterial: [
          { quote: 'Con n = 25 y s = 10, da 2.', explanation: 'Con n = 100 daría 1.' },
        ],
        modelContribution: [],
      },
      FRAGMENT,
    );
    expect(shown.fromMaterial).toEqual([]);
    expect(shown.modelContribution).toEqual(['Con n = 100 daría 1.']);
  });
});
