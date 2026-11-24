import { describe, expect, it } from 'vitest';
import { matchesFilter } from '../../src/core/cards';
import {
  type Activity,
  allowedVerdicts,
  canSetVerdict,
  engineSignal,
  evaluateNumeric,
  evaluateOptions,
  evaluateOrder,
  evaluateShort,
  hasPendingCheck,
  helpAvailability,
  helpLevelOf,
  initialOrder,
  letterDiff,
  maxHelpLevel,
  modeLabel,
  nextHint,
  normalizeShortAnswer,
  parseNumber,
  purposeOf,
  resultParts,
  shuffledOptions,
  validateActivity,
  verdictFromUnits,
} from '../../src/core/evaluation';

describe('respuesta corta: la comparación', () => {
  it('[CA-131] «paris» es correcta cuando la respuesta es «París»', () => {
    expect(evaluateShort('paris', ['París']).verdict).toBe('correct');
  });

  it('[CA-131] ignora mayúsculas, tildes y espacios de más o de menos', () => {
    for (const written of ['PARIS', '  París ', 'pa ris', 'PARÍS', 'París\t']) {
      expect(evaluateShort(written, ['París']).verdict).toBe('correct');
    }
  });

  it('respeta la ñ: «ano» no es «año»', () => {
    expect(normalizeShortAnswer('Año')).toBe('año');
    expect(evaluateShort('ano', ['año']).verdict).toBe('incorrect');
  });

  it('ignora la diéresis: «pinguino» es «pingüino»', () => {
    expect(evaluateShort('pinguino', ['pingüino']).verdict).toBe('correct');
  });

  it('una variante aceptable también es correcta', () => {
    const result = evaluateShort('Ciudad de París', ['París', 'Ciudad de París']);
    expect(result.verdict).toBe('correct');
    expect(result.matched).toBe('Ciudad de París');
  });

  it('una respuesta vacía no es correcta', () => {
    expect(evaluateShort('   ', ['París']).verdict).toBe('incorrect');
  });

  it('[CA-131] «Paría» es «Todavía no.» y muestra la diferencia letra por letra', () => {
    const result = evaluateShort('Paría', ['París']);
    expect(result.verdict).toBe('incorrect');
    expect(result.closest).toBe('París');
    expect(result.diff).toEqual([
      { op: 'same', written: 'P', expected: 'P' },
      { op: 'same', written: 'a', expected: 'a' },
      { op: 'same', written: 'r', expected: 'r' },
      { op: 'same', written: 'í', expected: 'í' },
      { op: 'changed', written: 'a', expected: 's' },
    ]);
  });

  it('[CA-131] la diferencia se calcula contra la referencia o variante más parecida', () => {
    const result = evaluateShort('Roman', ['París', 'Roma']);
    expect(result.closest).toBe('Roma');
    expect(result.diff.at(-1)).toEqual({ op: 'extra', written: 'n', expected: null });
  });

  it('la diferencia marca letras que faltan y que sobran', () => {
    expect(letterDiff('Pars', 'París').filter((step) => step.op !== 'same')).toEqual([
      { op: 'missing', written: null, expected: 'í' },
    ]);
    expect(letterDiff('Parrís', 'París').filter((step) => step.op !== 'same')).toEqual([
      { op: 'extra', written: 'r', expected: null },
    ]);
  });

  it('en la diferencia no cuentan las mayúsculas ni las tildes', () => {
    expect(letterDiff('paris', 'París').every((step) => step.op === 'same')).toBe(true);
  });
});

describe('numérica: coma, punto, margen y unidad', () => {
  const spec = { value: 4.2, tolerance: 0.05, unit: null };

  it('[CA-132] con respuesta 4,2 y margen 0,05: «4.2» y «4,22» son correctas', () => {
    expect(evaluateNumeric('4.2', spec, []).verdict).toBe('correct');
    expect(evaluateNumeric('4,22', spec, []).verdict).toBe('correct');
  });

  it('[CA-132] con respuesta 4,2 y margen 0,05: «4,3» no es correcta', () => {
    const result = evaluateNumeric('4,3', spec, []);
    expect(result.verdict).toBe('incorrect');
    expect(result.reason).toBe('off');
  });

  it('[CA-132] el borde del margen cuenta: 4,25 y 4,15 son correctas', () => {
    expect(evaluateNumeric('4,25', spec, []).verdict).toBe('correct');
    expect(evaluateNumeric('4.15', spec, []).verdict).toBe('correct');
    expect(evaluateNumeric('4,26', spec, []).verdict).toBe('incorrect');
  });

  it('«5,0» y «5» son 5; «5.3» no', () => {
    const five = { value: 5, tolerance: 0.05, unit: null };
    expect(evaluateNumeric('5,0', five, []).verdict).toBe('correct');
    expect(evaluateNumeric('5', five, []).verdict).toBe('correct');
    expect(evaluateNumeric('5.3', five, []).verdict).toBe('incorrect');
  });

  it('lee signos, ceros adelante y marcas de miles', () => {
    expect(parseNumber('-3,5')).toEqual({ value: -3.5, unit: null });
    expect(parseNumber('−2')).toEqual({ value: -2, unit: null });
    expect(parseNumber(',5')).toEqual({ value: 0.5, unit: null });
    expect(parseNumber('1.234,5')).toEqual({ value: 1234.5, unit: null });
    expect(parseNumber('1,234.5')).toEqual({ value: 1234.5, unit: null });
    expect(parseNumber('1.234.567')).toEqual({ value: 1234567, unit: null });
    expect(parseNumber('1.234')).toEqual({ value: 1.234, unit: null });
  });

  it('no inventa números: lo que no se lee es «no reconocí un número»', () => {
    for (const raw of ['', 'cinco', '1,2,3', '1.2.3,4.5', '--3', '1..2']) {
      expect(parseNumber(raw)).toBeNull();
    }
    expect(evaluateNumeric('cinco', spec, []).reason).toBe('unreadable');
  });

  it('la unidad es opcional; si se escribe, tiene que ser la pedida', () => {
    const minutes = { value: 5, tolerance: 0.05, unit: 'min' };
    expect(evaluateNumeric('5', minutes, []).verdict).toBe('correct');
    expect(evaluateNumeric('5 min', minutes, []).verdict).toBe('correct');
    expect(evaluateNumeric('5MIN', minutes, []).verdict).toBe('correct');
    const wrongUnit = evaluateNumeric('5 cm', minutes, []);
    expect(wrongUnit.verdict).toBe('incorrect');
    expect(wrongUnit.reason).toBe('unit');
    expect(evaluateNumeric('5 cm', spec, []).reason).toBe('unit');
  });

  it('una variante aceptada también es correcta', () => {
    expect(evaluateNumeric('4,4', spec, ['4,4']).verdict).toBe('correct');
  });
});

describe('opciones: tres, mezcladas, y la explicación de la equivocada', () => {
  const options = [
    { id: 'a', text: 'La mediana', correct: true, explanation: '' },
    { id: 'b', text: 'La media', correct: false, explanation: 'La media usa todos los valores.' },
    { id: 'c', text: 'El punto medio', correct: false, explanation: 'Depende de los extremos.' },
  ];

  it('[CA-133] elegir la equivocada da «Todavía no.» con su explicación', () => {
    const result = evaluateOptions('b', options);
    expect(result.verdict).toBe('incorrect');
    expect(result.explanation).toBe('La media usa todos los valores.');
  });

  it('[CA-133] elegir la correcta da «Correcto.» sin explicación de error', () => {
    expect(evaluateOptions('a', options)).toEqual({ verdict: 'correct', explanation: null });
  });

  it('[CA-133] la mezcla depende solo de la semilla y usa las tres opciones', () => {
    const first = shuffledOptions(['a', 'b', 'c'], 'intento-1');
    expect(shuffledOptions(['a', 'b', 'c'], 'intento-1')).toEqual(first);
    expect([...first].sort()).toEqual(['a', 'b', 'c']);
    const orders = new Set(
      Array.from({ length: 60 }, (_, n) => shuffledOptions(['a', 'b', 'c'], `s${n}`).join('')),
    );
    expect(orders.size).toBe(6);
  });

  it('[CA-133] un acierto en opciones no cuenta como evidencia sin ayuda: llega como «Con dudas»', () => {
    expect(engineSignal({ verdict: 'correct', helpLevel: 'A0', optionsQuestion: true })).toBe(
      'hard',
    );
    expect(engineSignal({ verdict: 'incorrect', helpLevel: 'A0', optionsQuestion: true })).toBe(
      'again',
    );
  });
});

describe('ordenar pasos', () => {
  const correct = ['s1', 's2', 's3', 's4'];

  it('el orden exacto es «Correcto.»', () => {
    expect(evaluateOrder(correct, correct, []).verdict).toBe('correct');
  });

  it('un solo par de pasos vecinos cambiados es «Vas bien.»', () => {
    const result = evaluateOrder(['s1', 's3', 's2', 's4'], correct, []);
    expect(result.verdict).toBe('partial');
    expect(result.perStep).toEqual(['ok', 'wrong', 'wrong', 'ok']);
  });

  it('el resto es «Todavía no.»', () => {
    expect(evaluateOrder(['s4', 's3', 's2', 's1'], correct, []).verdict).toBe('incorrect');
    expect(evaluateOrder(['s2', 's1', 's4', 's3'], correct, []).verdict).toBe('incorrect');
  });

  it('un orden aceptado también es correcto', () => {
    const other = ['s2', 's1', 's3', 's4'];
    expect(evaluateOrder(other, correct, [other]).verdict).toBe('correct');
  });

  it('el orden inicial depende de la semilla y nunca es el correcto', () => {
    for (let n = 0; n < 40; n += 1) {
      const initial = initialOrder(correct, `apertura-${n}`);
      expect(initial).not.toEqual(correct);
      expect([...initial].sort()).toEqual([...correct].sort());
      expect(initialOrder(correct, `apertura-${n}`)).toEqual(initial);
    }
  });
});

describe('respuesta abierta: las unidades de idea', () => {
  it('[CA-129] con 3 unidades: 3 → «Correcto.», 2 → «Vas bien.», 1 o 0 → «Todavía no.»', () => {
    expect(verdictFromUnits(3, 3)).toBe('correct');
    expect(verdictFromUnits(2, 3)).toBe('partial');
    expect(verdictFromUnits(1, 3)).toBe('incorrect');
    expect(verdictFromUnits(0, 3)).toBe('incorrect');
  });

  it('[CA-129] con 2 y con 4 unidades: todas, falta una, el resto', () => {
    expect(verdictFromUnits(2, 2)).toBe('correct');
    expect(verdictFromUnits(1, 2)).toBe('partial');
    expect(verdictFromUnits(0, 2)).toBe('incorrect');
    expect(verdictFromUnits(4, 4)).toBe('correct');
    expect(verdictFromUnits(3, 4)).toBe('partial');
    expect(verdictFromUnits(2, 4)).toBe('incorrect');
  });

  it('fuera de 2 a 4 unidades, o marcando más de las que hay, es un error', () => {
    expect(() => verdictFromUnits(1, 1)).toThrow();
    expect(() => verdictFromUnits(4, 5)).toThrow();
    expect(() => verdictFromUnits(4, 3)).toThrow();
  });
});

describe('bajar sí, subir no', () => {
  it('[CA-130] desde «Vas bien.» se puede bajar a «Todavía no.» y no subir a «Correcto.»', () => {
    expect(allowedVerdicts('partial')).toEqual(['partial', 'incorrect']);
    expect(canSetVerdict('partial', 'incorrect')).toBe(true);
    expect(canSetVerdict('partial', 'correct')).toBe(false);
  });

  it('[CA-130] desde «Correcto.» se puede todo; desde «Todavía no.», nada más', () => {
    expect(allowedVerdicts('correct')).toEqual(['correct', 'partial', 'incorrect']);
    expect(allowedVerdicts('incorrect')).toEqual(['incorrect']);
  });
});

describe('la barra de ayuda', () => {
  const fresh = {
    started: false,
    submitted: false,
    mode: 'practice' as const,
    hints: 3,
    hasExample: true,
    hasSource: true,
    used: [],
  };

  it('[CA-135] recién abierta, «Pista», «Ver un ejemplo» y «Fuente» están apagadas', () => {
    expect(helpAvailability(fresh)).toEqual({
      hint: false,
      example: false,
      source: false,
      noIdea: true,
    });
  });

  it('[CA-135] con un intento empezado (algo escrito o «No sé por dónde empezar») se prenden', () => {
    expect(helpAvailability({ ...fresh, started: true })).toEqual({
      hint: true,
      example: true,
      source: true,
      noIdea: false,
    });
  });

  it('sin ejemplo o sin fuente, esos botones siguen apagados', () => {
    const none = helpAvailability({ ...fresh, started: true, hasExample: false, hasSource: false });
    expect(none.example).toBe(false);
    expect(none.source).toBe(false);
    expect(none.hint).toBe(true);
  });

  it('en una evaluación no hay ninguna ayuda hasta enviar', () => {
    const evaluation = { ...fresh, mode: 'evaluation' as const, started: true };
    expect(helpAvailability(evaluation)).toEqual({
      hint: false,
      example: false,
      source: false,
      noIdea: false,
    });
  });

  it('[CA-136] las pistas llegan en orden: orientadora, concepto, paso, y después la confirmación', () => {
    const state = { ...fresh, started: true };
    expect(nextHint(state)).toEqual({ kind: 'hint', index: 0, level: 'A1' });
    const one = { ...state, used: [{ kind: 'hint' as const, level: 'A1' as const, index: 0 }] };
    expect(nextHint(one)).toEqual({ kind: 'hint', index: 1, level: 'A2' });
    const two = {
      ...state,
      used: [...one.used, { kind: 'hint' as const, level: 'A2' as const, index: 1 }],
    };
    expect(nextHint(two)).toEqual({ kind: 'hint', index: 2, level: 'A3' });
    const three = {
      ...state,
      used: [...two.used, { kind: 'hint' as const, level: 'A3' as const, index: 2 }],
    };
    expect(nextHint(three)).toEqual({ kind: 'confirmSolution' });
  });

  it('[CA-136] con menos pistas en la ficha, la confirmación llega antes', () => {
    expect(nextHint({ ...fresh, started: true, hints: 0 })).toEqual({ kind: 'confirmSolution' });
  });

  it('los niveles: ejemplo A3, fuente A2, solución A4, y el máximo de lo usado', () => {
    expect(helpLevelOf({ kind: 'example' })).toBe('A3');
    expect(helpLevelOf({ kind: 'source' })).toBe('A2');
    expect(helpLevelOf({ kind: 'solution' })).toBe('A4');
    expect(helpLevelOf({ kind: 'hint', index: 1 })).toBe('A2');
    expect(maxHelpLevel([])).toBe('A0');
    expect(
      maxHelpLevel([
        { kind: 'hint', level: 'A1', index: 0 },
        { kind: 'source', level: 'A2' },
      ]),
    ).toBe('A2');
  });

  it('[CA-137] con la primera ayuda el rótulo pasa a «PRÁCTICA CON AYUDA»', () => {
    expect(modeLabel({ mode: 'practice', used: [], attemptNo: 1 })).toBe('autonomous');
    expect(
      modeLabel({
        mode: 'practice',
        used: [{ kind: 'hint', level: 'A1', index: 0 }],
        attemptNo: 1,
      }),
    ).toBe('help');
    expect(modeLabel({ mode: 'evaluation', used: [], attemptNo: 1 })).toBe('evaluation');
    expect(
      purposeOf({ mode: 'practice', used: [{ kind: 'source', level: 'A2' }], attemptNo: 1 }),
    ).toBe('assisted');
    expect(purposeOf({ mode: 'evaluation', used: [], attemptNo: 1 })).toBe('evaluation');
  });

  it('un reintento de una evaluación ya es práctica', () => {
    expect(modeLabel({ mode: 'evaluation', used: [], attemptNo: 2 })).toBe('autonomous');
  });
});

describe('la señal para el motor según la ayuda', () => {
  it('[CA-137] un acierto con pregunta orientadora cuenta como sin ayuda', () => {
    expect(engineSignal({ verdict: 'correct', helpLevel: 'A1', optionsQuestion: false })).toBe(
      'good',
    );
  });

  it('[CA-137] un acierto con pista de concepto o de paso llega como «Con dudas»', () => {
    expect(engineSignal({ verdict: 'correct', helpLevel: 'A2', optionsQuestion: false })).toBe(
      'hard',
    );
    expect(engineSignal({ verdict: 'correct', helpLevel: 'A3', optionsQuestion: false })).toBe(
      'hard',
    );
  });

  it('con la solución vista llega como «No la sabía», aunque haya acertado', () => {
    expect(engineSignal({ verdict: 'correct', helpLevel: 'A4', optionsQuestion: false })).toBe(
      'again',
    );
  });

  it('«Vas bien.» llega como «Con dudas» y «Todavía no.» como «No la sabía»', () => {
    expect(engineSignal({ verdict: 'partial', helpLevel: 'A0', optionsQuestion: false })).toBe(
      'hard',
    );
    expect(engineSignal({ verdict: 'incorrect', helpLevel: 'A0', optionsQuestion: false })).toBe(
      'again',
    );
  });
});

describe('la comprobación sin ayuda', () => {
  const day = (
    studyDay: string,
    verdict: 'correct' | 'incorrect',
    helpLevel: 'A0' | 'A2' | 'A4',
  ) => ({
    studyDay,
    counted: true,
    verdict,
    helpLevel,
    optionsQuestion: false,
  });

  it('[CA-137] queda pendiente después de un acierto con pista de concepto', () => {
    expect(hasPendingCheck([day('2027-03-15', 'correct', 'A2')])).toBe(true);
  });

  it('se cumple con un acierto sin ayuda otro día', () => {
    expect(
      hasPendingCheck([day('2027-03-15', 'correct', 'A2'), day('2027-03-17', 'correct', 'A0')]),
    ).toBe(false);
  });

  it('un fallo o un acierto con ayuda no la cumplen; lo que no contó no cambia nada', () => {
    expect(
      hasPendingCheck([day('2027-03-15', 'correct', 'A2'), day('2027-03-16', 'incorrect', 'A0')]),
    ).toBe(true);
    expect(
      hasPendingCheck([
        day('2027-03-15', 'correct', 'A2'),
        { ...day('2027-03-15', 'correct', 'A0'), counted: false },
      ]),
    ).toBe(true);
    expect(hasPendingCheck([day('2027-03-15', 'correct', 'A0')])).toBe(false);
    expect(hasPendingCheck([])).toBe(false);
  });
});

describe('el resultado en tres líneas', () => {
  it('[CA-134] un acierto sin ayuda: «Correcto.», nada para revisar y seguir', () => {
    expect(
      resultParts({ type: 'short', verdict: 'correct', used: [], optionsQuestion: false }),
    ).toEqual({ verdict: 'correct', review: 'nothing', action: 'next' });
  });

  it('[CA-137] un acierto con pista de concepto: «Logrado con pista de concepto» y la comprobación', () => {
    const parts = resultParts({
      type: 'open',
      verdict: 'correct',
      used: [
        { kind: 'hint', level: 'A1', index: 0 },
        { kind: 'hint', level: 'A2', index: 1 },
      ],
      optionsQuestion: false,
    });
    expect(parts).toEqual({ verdict: 'hintConcept', review: 'helpUsed', action: 'check' });
  });

  it('[CA-134] cada ayuda tiene su veredicto', () => {
    const correctWith = (used: Parameters<typeof resultParts>[0]['used']) =>
      resultParts({ type: 'open', verdict: 'correct', used, optionsQuestion: false }).verdict;
    expect(correctWith([{ kind: 'hint', level: 'A1', index: 0 }])).toBe('correct');
    expect(correctWith([{ kind: 'hint', level: 'A3', index: 2 }])).toBe('hintStep');
    expect(correctWith([{ kind: 'example', level: 'A3' }])).toBe('example');
    expect(correctWith([{ kind: 'source', level: 'A2' }])).toBe('source');
    expect(correctWith([{ kind: 'solution', level: 'A4' }])).toBe('solution');
  });

  it('[CA-134] con la pregunta orientadora, «Correcto.» y se anota que la usaste', () => {
    expect(
      resultParts({
        type: 'short',
        verdict: 'correct',
        used: [{ kind: 'hint', level: 'A1', index: 0 }],
        optionsQuestion: false,
      }),
    ).toEqual({ verdict: 'correct', review: 'orientingUsed', action: 'next' });
  });

  it('[CA-134] lo que se revisa depende del tipo cuando no salió', () => {
    const notYet = (type: Activity['type']) =>
      resultParts({ type, verdict: 'incorrect', used: [], optionsQuestion: type === 'options' });
    expect(notYet('short').review).toBe('letters');
    expect(notYet('numeric').review).toBe('number');
    expect(notYet('options').review).toBe('optionExplanation');
    expect(notYet('order').review).toBe('steps');
    expect(notYet('open').review).toBe('missingUnits');
    expect(notYet('open').action).toBe('explanation');
  });

  it('[CA-134] «Vas bien.» propone reintentar; un acierto en opciones avisa que no es sin ayuda', () => {
    expect(
      resultParts({ type: 'open', verdict: 'partial', used: [], optionsQuestion: false }),
    ).toEqual({ verdict: 'partial', review: 'missingUnits', action: 'retry' });
    expect(
      resultParts({ type: 'options', verdict: 'correct', used: [], optionsQuestion: true }),
    ).toEqual({ verdict: 'correct', review: 'optionsChance', action: 'next' });
  });
});

describe('lo que exige cada editor', () => {
  it('opciones: exactamente 3, una correcta y explicación en cada equivocada', () => {
    const ok: Activity = {
      type: 'options',
      options: [
        { id: 'a', text: 'Uno', correct: true, explanation: '' },
        { id: 'b', text: 'Dos', correct: false, explanation: 'Porque no.' },
        { id: 'c', text: 'Tres', correct: false, explanation: 'Tampoco.' },
      ],
    };
    expect(validateActivity(ok)).toEqual([]);
    expect(
      validateActivity({
        type: 'options',
        options: ok.type === 'options' ? ok.options.slice(0, 2) : [],
      }),
    ).toContain('optionsCount');
    const twoRight: Activity = {
      type: 'options',
      options: [
        { id: 'a', text: 'Uno', correct: true, explanation: '' },
        { id: 'b', text: 'Dos', correct: true, explanation: '' },
        { id: 'c', text: 'Tres', correct: false, explanation: 'No.' },
      ],
    };
    expect(validateActivity(twoRight)).toContain('optionsCorrect');
    const noReason: Activity = {
      type: 'options',
      options: [
        { id: 'a', text: 'Uno', correct: true, explanation: '' },
        { id: 'b', text: 'Dos', correct: false, explanation: ' ' },
        { id: 'c', text: 'Tres', correct: false, explanation: 'No.' },
      ],
    };
    expect(validateActivity(noReason)).toContain('optionsExplanation');
  });

  it('respuesta abierta: de 2 a 4 unidades de idea, ninguna vacía', () => {
    const unit = (id: string, text: string) => ({ id, text });
    expect(
      validateActivity({ type: 'open', units: [unit('u1', 'Una'), unit('u2', 'Otra')] }),
    ).toEqual([]);
    expect(validateActivity({ type: 'open', units: [unit('u1', 'Una')] })).toContain('unitsCount');
    expect(
      validateActivity({ type: 'open', units: [unit('u1', 'Una'), unit('u2', '  ')] }),
    ).toContain('unitsBlank');
  });

  it('ordenar pasos: de 3 a 8 pasos distintos', () => {
    const steps = ['A', 'B', 'C'].map((text, n) => ({ id: `s${n}`, text }));
    expect(validateActivity({ type: 'order', steps, acceptedOrders: [] })).toEqual([]);
    expect(
      validateActivity({ type: 'order', steps: steps.slice(0, 2), acceptedOrders: [] }),
    ).toContain('stepsCount');
    expect(
      validateActivity({
        type: 'order',
        steps: [...steps, { id: 's9', text: 'a ' }],
        acceptedOrders: [],
      }),
    ).toContain('stepsRepeated');
  });

  it('numérica: un número, un margen de cero o más y la unidad opcional', () => {
    expect(validateActivity({ type: 'numeric', value: 5, tolerance: 0.05, unit: null })).toEqual(
      [],
    );
    expect(validateActivity({ type: 'numeric', value: 5, tolerance: -1, unit: null })).toContain(
      'tolerance',
    );
    expect(
      validateActivity({ type: 'numeric', value: Number.NaN, tolerance: 0, unit: null }),
    ).toContain('value');
  });

  it('respuesta corta: no pide nada más que la respuesta de la tarjeta', () => {
    expect(validateActivity({ type: 'short' })).toEqual([]);
  });
});

describe('la lista de Tarjetas: el filtro «Ejercicio»', () => {
  const classic = {
    topicId: null,
    sheetState: 'reviewed' as const,
    kind: 'qa' as const,
    activityType: null,
  };
  const exercise = { ...classic, activityType: 'numeric' as const };

  it('«Ejercicio» deja solo los ejercicios; «Pregunta y respuesta» deja afuera los ejercicios', () => {
    expect(matchesFilter(exercise, { kind: 'exercise' })).toBe(true);
    expect(matchesFilter(classic, { kind: 'exercise' })).toBe(false);
    expect(matchesFilter(exercise, { kind: 'qa' })).toBe(false);
    expect(matchesFilter(classic, { kind: 'qa' })).toBe(true);
    expect(matchesFilter(exercise, {})).toBe(true);
  });
});

describe('la comprobación sin ayuda, cuando el acierto con pista no fue el primero del día', () => {
  const attempt = (
    studyDay: string,
    verdict: 'correct' | 'incorrect',
    helpLevel: 'A0' | 'A2',
    counted: boolean,
    valid = true,
  ) => ({ studyDay, counted, verdict, helpLevel, optionsQuestion: false, valid });

  it('[CA-137] un acierto con pista de concepto que no contó (segundo del día) igual deja la comprobación pendiente', () => {
    expect(
      hasPendingCheck([
        attempt('2027-03-15', 'incorrect', 'A0', true),
        attempt('2027-03-15', 'correct', 'A2', false),
      ]),
    ).toBe(true);
  });

  it('[CA-137] la cumple un acierto sin ayuda que cuente otro día; uno del mismo día, no', () => {
    const aided = attempt('2027-03-15', 'correct', 'A2', false);
    expect(hasPendingCheck([aided, attempt('2027-03-15', 'correct', 'A0', false)])).toBe(true);
    expect(hasPendingCheck([aided, attempt('2027-03-16', 'correct', 'A0', true)])).toBe(false);
  });

  it('un intento afectado o sin evaluar no deja nada pendiente', () => {
    expect(hasPendingCheck([attempt('2027-03-15', 'correct', 'A2', true, false)])).toBe(false);
  });
});
