import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createRecordedProvider, type RecordedAnswer } from '../../ai/adapters/recorded';
import type { AiProvider, CompletionRequest } from '../../ai/provider';

// La IA simulada de «Retenia (prueba)» (Fase 19): Ajustes › «Demostración» › «IA simulada», «IA
// simulada: responder mal» y «IA simulada: tardar 12 segundos». Contesta con las respuestas grabadas
// de datos-de-ejemplo/ia/ (indexadas por lo que dice el pasaje) y, para cualquier otro pasaje, con
// una plantilla que cita su primera oración. No saca nada de la PC ni gasta: no pide permiso ni
// figura en «Qué se envió». Respeta la conexión, como la de verdad. Los interruptores quedan en
// ajustes.json, como «Procesar despacio».
// También acá: `RETENIA_IA_ORIGEN`, la dirección del servidor de la IA en la PC para la punta a
// punta (solo `http://127.0.0.1:<puerto>`; la versión real no tiene esto).

export interface DemoAiState {
  simulated: boolean;
  bad: boolean;
  slow: boolean;
}

export interface DemoAi {
  state(): DemoAiState;
  set(patch: Partial<DemoAiState>): DemoAiState;
  provider(): AiProvider | null;
}

const SLOW_MS = 12_000;

const recordings = z.object({
  respuestas: z.array(z.object({ si: z.string().min(1), salida: z.string() })),
  mal: z.string(),
  plantilla: z.object({ explicacion: z.string(), aporte: z.string() }),
});
type Recordings = z.output<typeof recordings>;

const stateSchema = z.object({
  simulated: z.boolean().catch(false),
  bad: z.boolean().catch(false),
  slow: z.boolean().catch(false),
});

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// El pasaje tal como llegó en el pedido (entre las marcas del fragmento).
function passageOf(request: CompletionRequest): string {
  const match = /<fragmento[^>]*>\n([\s\S]*)\n<\/fragmento>/u.exec(request.user);
  return match?.[1] ?? '';
}

// La plantilla: la primera oración de tres palabras o más, citada tal cual.
function templateAnswer(passage: string, { plantilla }: Recordings): string {
  const sentence = passage
    .split(/(?<=[.!?])\s+/u)
    .map((piece) => piece.trim())
    .find((piece) => piece.split(/\s+/u).length >= 3);
  return JSON.stringify({
    fromMaterial: sentence ? [{ quote: sentence, explanation: plantilla.explicacion }] : [],
    modelContribution: [plantilla.aporte],
  });
}

// Lo que dice una respuesta que gasta: lo mismo que una consulta típica (para nada se cobra).
const TYPICAL_USAGE = { inputTokens: 900, outputTokens: 450 };

export function createDemoAi({
  dataDir,
  samplesDir,
  isOffline,
}: {
  dataDir: string;
  samplesDir: string;
  isOffline: () => boolean;
}): DemoAi {
  const file = join(dataDir, 'ajustes.json');
  const parsed = stateSchema.safeParse(readSettings(file).demoAi);
  let state: DemoAiState = parsed.success
    ? parsed.data
    : { simulated: false, bad: false, slow: false };
  let loaded: Recordings | null = null;
  const load = (): Recordings => {
    loaded ??= recordings.parse(
      JSON.parse(readFileSync(join(samplesDir, 'ia', 'explicar-fragmento.json'), 'utf8')),
    );
    return loaded;
  };
  const answer = (request: CompletionRequest): RecordedAnswer => {
    const saved = load();
    if (state.bad) {
      return { text: saved.mal, usage: TYPICAL_USAGE };
    }
    const passage = passageOf(request);
    const recorded = saved.respuestas.find((entry) => passage.includes(entry.si));
    return { text: recorded?.salida ?? templateAnswer(passage, saved), usage: TYPICAL_USAGE };
  };
  const simulatedProvider = createRecordedProvider({
    kind: 'local',
    answer,
    isOffline,
    delayMs: () => (state.slow ? SLOW_MS : 0),
    variant: () => (state.bad ? 'mal' : 'grabada'),
  });
  return {
    state: () => ({ ...state }),
    set(patch) {
      state = { ...state, ...patch };
      mkdirSync(dataDir, { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ ...readSettings(file), demoAi: state })}\n`);
      renameSync(temporary, file);
      return { ...state };
    },
    provider: () => (state.simulated ? simulatedProvider : null),
  };
}

// La dirección del servidor de la IA en la PC, si la punta a punta la pidió (`RETENIA_IA_ORIGEN`).
export function demoAiOrigin(): string | undefined {
  const origin = process.env.RETENIA_IA_ORIGEN;
  return origin !== undefined && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(origin)
    ? origin
    : undefined;
}
