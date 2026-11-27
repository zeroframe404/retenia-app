import { z } from 'zod';
import {
  type ConsequenceLevel,
  locateQuote,
  maxCostMicros,
  numbersAgree,
  utf8Length,
} from '../../core/ai';
import { AI_MODELS } from '../models';
import { priceFor } from '../prices';
import { EXPLAIN_PROMPT } from '../prompts/explicar-fragmento';
import { fragmentBlock, neutralizeFragment } from '../request';
import { toApiSchema } from '../schema-api';

// «Explicar un fragmento» (Fase 19, H-41): la primera función de IA, de exploración. Se muestra
// separada en «Según tu material» (lo que se respalda con una cita textual del pasaje) y «Aporte del
// modelo, no verificado»; no se guarda como dato de aprendizaje.

export const EXPLAIN_FRAGMENT = {
  id: 'explain_fragment',
  level: 'exploration' satisfies ConsequenceLevel,
  prompt: EXPLAIN_PROMPT,
  // Esta función no corrige: no tiene rúbrica.
  rubricVersion: null,
  ...AI_MODELS.explain_fragment,
  // Hasta unas 600 palabras.
  maxChars: 4000,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const explainOutputSchema = z
  .strictObject({
    fromMaterial: z.array(z.strictObject({ quote: text(600), explanation: text(800) })).max(6),
    modelContribution: z.array(text(800)).max(6),
  })
  .refine((output) => output.fromMaterial.length + output.modelContribution.length > 0);

export type ExplainOutput = z.output<typeof explainOutputSchema>;

export interface ExplainResult {
  fromMaterial: { quote: string; explanation: string; start: number; end: number }[];
  modelContribution: string[];
}

export function buildExplainRequest({
  fragment,
  materialTitle,
}: {
  fragment: string;
  materialTitle: string;
}): { system: string; user: string } {
  return {
    system: EXPLAIN_PROMPT.system,
    user: `Explicá este pasaje de mi material.\n\n${fragmentBlock(materialTitle, fragment)}`,
  };
}

// El esquema de la salida también viaja (y se cobra como entrada).
const SCHEMA_BYTES = utf8Length(JSON.stringify(toApiSchema(explainOutputSchema)));

// Lo máximo que puede costar un pedido antes de mandarlo (CA-169): con eso se decide si entra en el
// tope y, si no llega respuesta, es lo que se anota.
export function maxCostOf(request: { system: string; user: string }): number {
  return maxCostMicros(
    {
      inputBytes: utf8Length(request.system) + utf8Length(request.user) + SCHEMA_BYTES,
      maxOutputTokens: EXPLAIN_FRAGMENT.maxTokens,
    },
    priceFor(EXPLAIN_FRAGMENT.model),
  );
}

// Los verificadores, antes de mostrar nada (CA-177): una cita que no está letra por letra en el
// pasaje que se mandó, o una explicación con un número que no está en el pasaje, pasa a «Aporte del
// modelo, no verificado» (la explicación, sin la supuesta cita). Las posiciones son las del pasaje.
export function verifyExplanation(output: ExplainOutput, fragment: string): ExplainResult {
  const sent = neutralizeFragment(fragment);
  const fromMaterial: ExplainResult['fromMaterial'] = [];
  const degraded: string[] = [];
  for (const item of output.fromMaterial) {
    const found = locateQuote(sent, item.quote);
    if (found && numbersAgree(item.explanation, sent)) {
      fromMaterial.push({
        quote: sent.slice(found.start, found.end),
        explanation: item.explanation,
        ...found,
      });
    } else {
      degraded.push(item.explanation);
    }
  }
  return { fromMaterial, modelContribution: [...output.modelContribution, ...degraded] };
}
