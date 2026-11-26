// El modelo de cada función de IA, fijado explícitamente (Fase 19): son los de docs/versiones.md
// (lo controla una prueba estática). «Explicar un fragmento» usa Opus 5.5, tu decisión del
// 26/11/2026: unos USD 0,01 a 0,03 por explicación. Esfuerzo bajo: explicar un pasaje no pide más.

export const AI_MODELS = {
  explain_fragment: { model: 'claude-opus-5-5', effort: 'low', maxTokens: 2000 },
} as const;

// La fecha a partir de la cual cada modelo se puede retirar (docs/versiones.md): «Probar conexión»
// avisa 60 días antes.
export const MODEL_NOT_BEFORE: Readonly<Record<string, string>> = {
  'claude-opus-5-5': '2027-09-22',
};
