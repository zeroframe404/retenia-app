import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  anomalousRatio,
  blockSignals,
  OCR_DOUBT_BELOW,
  textLayer,
  unitSignals,
} from '../../src/core/materials/quality';

// Las señales de calidad de un material (H-27): avisos, nunca veredictos. Una página sin capa de
// texto, o con muy poca para su tamaño, es «No extraído»; una unidad con señal es «Con problemas».

const A4 = { width: 595, height: 842 };

describe('capa de texto de una página', () => {
  it('[CA-113] una página sin texto es «none» y una con muy poco para su tamaño es «sparse»', () => {
    expect(textLayer({ chars: 0, ...A4 })).toBe('none');
    expect(textLayer({ chars: 12, ...A4 })).toBe('sparse');
    expect(textLayer({ chars: 120, ...A4 })).toBe('sparse');
  });

  it('[CA-113] las páginas del elenco con 674 a 1408 caracteres tienen capa de texto', () => {
    for (const chars of [674, 731, 808, 949, 1408]) {
      expect(textLayer({ chars, ...A4 })).toBe('ok');
    }
  });

  it('[CA-113] una hoja chica con poco texto no es «sparse» si el texto llena su tamaño', () => {
    expect(textLayer({ chars: 60, width: 100, height: 100 })).toBe('ok');
  });

  it('[CA-113] sin tamaño conocido solo cuenta si hay o no texto', () => {
    expect(textLayer({ chars: 0, width: null, height: null })).toBe('none');
    expect(textLayer({ chars: 500, width: null, height: null })).toBe('ok');
  });

  it('[CA-113] más texto en la misma hoja nunca empeora la capa', () => {
    const order = { none: 0, sparse: 1, ok: 2 } as const;
    fc.assert(
      fc.property(fc.nat(5000), fc.nat(5000), (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(order[textLayer({ chars: low, ...A4 })]).toBeLessThanOrEqual(
          order[textLayer({ chars: high, ...A4 })],
        );
      }),
    );
  });
});

describe('caracteres anómalos', () => {
  it('[CA-113] el texto normal no tiene ninguno y el reemplazo «�» o los caracteres de control sí', () => {
    expect(anomalousRatio('La media muestral es 5,2 ± 0,3 (95 %).')).toBe(0);
    expect(anomalousRatio('��� abc')).toBeGreaterThan(0.3);
    expect(anomalousRatio('abc\u0001\u0002def')).toBeGreaterThan(0.2);
    expect(anomalousRatio('')).toBe(0);
  });

  it('[CA-113] la proporción siempre está entre 0 y 1', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const ratio = anomalousRatio(text);
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('señales por bloque', () => {
  it('[CA-113] la tabla de la página 7 lleva «posible tabla» y la fórmula de la 11 «posible fórmula»', () => {
    const table =
      'Grados de libertad\t90 %\t95 %\t99 %\n1\t6,314\t12,706\t63,657\n2\t2,920\t4,303\t9,925';
    expect(blockSignals({ type: 'table', text: table })).toContain('possibleTable');
    expect(blockSignals({ type: 'formula', text: 'x̄ − μ0\nt =\ns / √n' })).toContain(
      'possibleFormula',
    );
  });

  it('[CA-113] un párrafo con columnas alineadas de cifras es una posible tabla aunque no se haya detectado', () => {
    const text = 'n 10 20 30\nmedia 5,1 5,3 5,2\ndesvío 1,1 1,4 1,2\nerror 0,3 0,3 0,2';
    expect(blockSignals({ type: 'paragraph', text })).toContain('possibleTable');
  });

  it('[CA-113] un párrafo con símbolos matemáticos es una posible fórmula', () => {
    expect(blockSignals({ type: 'paragraph', text: 'Σ (xᵢ − x̄)² ≥ 0 y √n ≈ 4' })).toContain(
      'possibleFormula',
    );
  });

  it('[CA-113] un párrafo común no lleva ninguna señal', () => {
    const text =
      'La estadística trabaja casi siempre con información incompleta. Queremos saber algo de un conjunto grande.';
    expect(blockSignals({ type: 'paragraph', text })).toEqual([]);
    expect(blockSignals({ type: 'section', text: '1.1 Población y muestra' })).toEqual([]);
  });

  it('[CA-113] la lista y el párrafo con una cifra suelta no son tablas', () => {
    expect(blockSignals({ type: 'paragraph', text: 'El error estándar es 0,375.' })).toEqual([]);
    expect(blockSignals({ type: 'list', text: 'uno\ndos\ntres' })).toEqual([]);
  });

  it('[CA-114] el reconocimiento dudoso (confianza baja) es una señal y uno seguro no', () => {
    expect(OCR_DOUBT_BELOW).toBeGreaterThan(50);
    const text = 'Una prueba de hipótesis es una forma ordenada de decidir.';
    expect(blockSignals({ type: 'paragraph', text, ocrConfidence: OCR_DOUBT_BELOW - 1 })).toContain(
      'lowConfidence',
    );
    expect(blockSignals({ type: 'paragraph', text, ocrConfidence: 96 })).toEqual([]);
    expect(blockSignals({ type: 'paragraph', text, ocrConfidence: null })).toEqual([]);
  });

  it('[CA-113] los caracteres raros son una señal solo si son una parte apreciable del texto', () => {
    expect(blockSignals({ type: 'paragraph', text: 'Una muestra ��� de la población' })).toContain(
      'anomalousChars',
    );
    expect(
      blockSignals({
        type: 'paragraph',
        text: `${'Una muestra bien elegida se parece a la población. '.repeat(6)}�`,
      }),
    ).not.toContain('anomalousChars');
  });
});

describe('señales por unidad', () => {
  it('[CA-113] una página con poco texto para su tamaño avisa «cobertura baja» sin ser «No extraído»', () => {
    expect(unitSignals({ chars: 250, ...A4 })).toContain('lowCoverage');
    expect(unitSignals({ chars: 700, ...A4 })).toEqual([]);
  });

  it('[CA-114] una página reconocida con confianza baja avisa «reconocimiento dudoso»', () => {
    expect(unitSignals({ chars: 900, ...A4, ocrConfidence: 40 })).toContain('lowConfidence');
    expect(unitSignals({ chars: 900, ...A4, ocrConfidence: 95 })).toEqual([]);
  });
});
