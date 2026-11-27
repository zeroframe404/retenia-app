import { z } from 'zod';

// Los canales de la IA (Fase 19, H-40 y H-41). Ninguna respuesta lleva la clave: la ventana sabe
// si hay una guardada, nunca cuál es. Ningún canal escribe en tarjetas, repasos ni dominio: la IA
// solo muestra (exploración) o, desde la Fase 21, propone.

export const AI_FUNCTION_IDS = ['explain_fragment'] as const;
const functionId = z.enum(AI_FUNCTION_IDS);
const micros = z.number().int().nonnegative();
// El tope, en centavos: de USD 0,01 a USD 1.000.
const capCents = z.number().int().min(1).max(100_000);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().nonnegative();
const position = z.strictObject({ blockId: z.uuid(), offset: count });

export const aiStatusSchema = z.strictObject({
  // Con qué IA se habla: ninguna, la de Anthropic con tu clave o la IA simulada de la demostración.
  provider: z.enum(['none', 'anthropic', 'simulated']),
  keySaved: z.boolean(),
  // Si Windows puede guardar la clave cifrada.
  secureStorage: z.boolean(),
  localOnly: z.boolean(),
  capCents,
  spentMicros: micros,
  capState: z.enum(['ok', 'warning', 'reached']),
  percentUsed: count,
  functions: z.array(
    z.strictObject({ id: functionId, state: z.enum(['enabled', 'in_review', 'suspended']) }),
  ),
});
export type AiStatus = z.output<typeof aiStatusSchema>;

// La clave pegada: una sola palabra, de 20 a 400 caracteres. Sin clave, se prueba la guardada.
export const aiTestConnectionRequest = z.strictObject({
  key: z.string().min(20).max(400).regex(/^\S+$/).optional(),
});
export const aiConnectionSchema = z.strictObject({
  result: z.enum([
    'ok',
    'no_key',
    'invalid_key',
    'offline',
    'local_only',
    'model_unavailable',
    'insecure',
    'technical',
  ]),
  // Si el modelo se puede retirar pronto, desde qué día.
  retiresOn: isoDay.nullable(),
  status: aiStatusSchema,
});
export type AiConnection = z.output<typeof aiConnectionSchema>;

export const aiSetCapRequest = z.strictObject({ capCents });
export const aiSetLocalOnlyRequest = z.strictObject({ on: z.boolean() });
export const aiSetFunctionStateRequest = z.strictObject({ functionId, suspended: z.boolean() });

// «Qué se envió»: cada envío, sin el texto del pasaje ni la respuesta.
export const aiSentLogSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      id: z.uuid(),
      day: isoDay,
      purpose: functionId,
      materialTitle: z.string(),
      fragmentCount: z.number().int().positive(),
      costMicros: micros,
      // 'unanswered': salió y no llegó respuesta; cuenta lo máximo que pudo costar.
      status: z.enum(['ok', 'rejected_schema', 'refused', 'failed', 'unanswered']),
    }),
  ),
});
export type AiSentLog = z.output<typeof aiSentLogSchema>;

export const aiPermissionsSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      materialId: z.uuid(),
      title: z.string(),
      scope: z.enum(['always', 'never']),
    }),
  ),
});
export type AiPermissions = z.output<typeof aiPermissionsSchema>;
export const aiMaterialRequest = z.strictObject({ materialId: z.uuid() });

// «Explicame este fragmento»: el pasaje lo vuelve a leer el principal de tu material guardado.
// `permission`: lo que elegiste en «¿Permitir enviar fragmentos de este material a la IA?».
export const aiExplainRequest = z.strictObject({
  materialId: z.uuid(),
  selection: z.strictObject({ from: position, to: position }),
  permission: z.enum(['once', 'always', 'never']).optional(),
});

const explanationSchema = z.strictObject({
  fromMaterial: z.array(
    z.strictObject({ quote: z.string(), explanation: z.string(), start: count, end: count }),
  ),
  modelContribution: z.array(z.string()),
});

export const aiOutcomeSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('blocked'),
    reason: z.enum([
      'suspended',
      'local_only',
      'not_connected',
      'too_long',
      'cap_reached',
      'permission_denied',
    ]),
    spentMicros: micros,
    capCents,
  }),
  z.strictObject({ state: z.literal('needs_permission') }),
  z.strictObject({
    state: z.literal('pending'),
    requestId: z.uuid(),
    reason: z.enum(['sending', 'offline', 'retrying']),
  }),
  z.strictObject({
    state: z.literal('done'),
    requestId: z.uuid(),
    result: explanationSchema,
    cost: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('paid'), micros }),
      z.strictObject({ kind: z.literal('cached') }),
      z.strictObject({ kind: z.literal('simulated') }),
    ]),
    // El aviso del tope: el porcentaje del mes, desde el 80 % (nulo si no hace falta avisar).
    percentUsed: count.nullable(),
  }),
  z.strictObject({
    state: z.literal('failed'),
    requestId: z.uuid(),
    reason: z.enum([
      'format',
      'technical',
      'auth',
      'billing',
      'refused',
      // Lo que esperaba y ya no puede salir: a mano, por el modo solo local, la función suspendida,
      // el permiso quitado, sin IA o con otra IA conectada.
      'cancelled',
      'cancelled_local_only',
      'cancelled_suspended',
      'cancelled_permission',
      'cancelled_no_ai',
      'cancelled_ai_changed',
    ]),
  }),
]);
export type AiOutcome = z.input<typeof aiOutcomeSchema>;

export const aiRequestIdRequest = z.strictObject({ requestId: z.uuid() });
