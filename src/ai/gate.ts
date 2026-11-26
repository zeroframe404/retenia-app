import { createHash } from 'node:crypto';
import {
  type AiFunctionState,
  capState,
  costMicros,
  decideRequest,
  fitsUnderCap,
  functionState,
  maxCostMicros,
  monthBounds,
  monthOf,
  type PermissionChoice,
  percentUsed,
} from '../core/ai';
import { type Clock, type Stopwatch, systemStopwatch } from '../core/clock';
import type { AiOutcome } from '../preload/contract/ai';
import type { AiEvent } from '../preload/contract/events';
import {
  buildExplainRequest,
  EXPLAIN_FRAGMENT,
  type ExplainOutput,
  explainOutputSchema,
  verifyExplanation,
} from './functions/explain-fragment';
import { parseModelOutput } from './parse';
import type { AiQueueItem, AiRequestStatus, AiStorePort } from './ports';
import { PRICES, priceFor } from './prices';
import { type AiProvider, AiProviderError, type CompletionResponse } from './provider';
import { toApiSchema } from './schema-api';

// La compuerta de IA (Fase 19, docs/arquitectura.md §9). Todo pedido pasa por acá, en este orden:
// los controles (decideRequest: función suspendida, «Modo solo local», sin IA, pasaje largo, tope,
// lo ya guardado, permiso del material), la cola, el envío, la validación entera de la respuesta
// (CA-173), los verificadores (CA-177), «Qué se envió» con el costo calculado en la PC (CA-169,
// CA-171) y lo guardado para no volver a pagar. La compuerta solo escribe en sus tablas (el puerto
// `store`): lo que devuelve la IA se muestra; nunca toca tu aprendizaje (CA-174).
// Sin conexión, el pedido espera en la cola y sale solo cuando vuelve (CA-176). Un error técnico se
// reintenta hasta 3 veces y se dice como error técnico.

export interface AiPrefs {
  readonly capCents: number;
  readonly localOnly: boolean;
  readonly suspended: readonly string[];
}

export interface AiGate {
  explain(input: {
    materialId: string;
    materialTitle: string;
    fragment: string;
    choice: PermissionChoice | null;
  }): AiOutcome;
  outcome(requestId: string): AiOutcome | null;
  cancel(requestId: string): AiOutcome | null;
  // Cancela todo lo pendiente (al prender «Modo solo local»).
  cancelPending(): void;
  // Manda lo pendiente, una vez cada pedido; lo que falla espera la próxima vuelta.
  sendPending(): Promise<void>;
  monthSpentMicros(): number;
  functionStateOf(id: string): AiFunctionState;
  // Al abrir: lo que quedó «enviándose» en un cierre vuelve a la cola.
  recover(): void;
}

const MAX_ATTEMPTS = 3;
const TRANSIENT = new Set(['busy', 'server', 'timeout']);
const API_SCHEMA = toApiSchema(explainOutputSchema);

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export function createAiGate({
  store,
  clock,
  newId,
  prefs,
  provider,
  isOffline,
  notify = () => undefined,
  stopwatch = systemStopwatch(),
}: {
  // El almacén vigente en cada pedido (después de restaurar una copia, la base es otra).
  store: () => AiStorePort;
  clock: Clock;
  newId: () => string;
  prefs: () => AiPrefs;
  provider: () => AiProvider | null;
  isOffline: () => boolean;
  notify?: (event: AiEvent) => void;
  stopwatch?: Stopwatch;
}): AiGate {
  const now = () => clock.now().toISOString();
  const monthSpentMicros = () => store().spentMicros(monthBounds(monthOf(clock.now())));
  const functionStateOf = (id: string) =>
    functionState({ suspended: prefs().suspended.includes(id), inReview: false });

  const requestOf = (fragment: string, materialTitle: string) => {
    const built = buildExplainRequest({ fragment, materialTitle });
    return {
      ...built,
      maxCost: maxCostMicros(
        {
          inputChars: built.system.length + built.user.length,
          maxOutputTokens: EXPLAIN_FRAGMENT.maxTokens,
        },
        priceFor(EXPLAIN_FRAGMENT.model),
      ),
    };
  };

  const cacheKeyOf = (current: AiProvider, materialTitle: string, fragment: string) =>
    sha256(
      JSON.stringify([
        EXPLAIN_FRAGMENT.id,
        current.id,
        current.variant(),
        EXPLAIN_FRAGMENT.model,
        EXPLAIN_FRAGMENT.prompt.version,
        EXPLAIN_FRAGMENT.rubricVersion,
        materialTitle,
        fragment,
      ]),
    );

  // El aviso del tope (desde el 80 %), solo con la IA que gasta.
  const warningOf = (current: AiProvider | null): number | null => {
    if (current?.kind !== 'remote') {
      return null;
    }
    const spent = monthSpentMicros();
    const { capCents } = prefs();
    return capState(spent, capCents) === 'ok' ? null : percentUsed(spent, capCents);
  };

  const pendingOutcome = (item: AiQueueItem): AiOutcome => ({
    state: 'pending',
    requestId: item.id,
    reason: item.waiting,
  });

  const finish = (item: AiQueueItem, outcome: AiOutcome) => {
    store().finish(item.id, JSON.stringify(outcome), now());
    notify({ type: 'ai.result', requestId: item.id });
  };

  const trace = (
    item: AiQueueItem,
    event: 'sent' | 'answered' | 'error' | 'offline' | 'cancelled',
    attempt: number,
    detail: { errorKind?: string; httpStatus?: number | null; latencyMs?: number } = {},
  ) =>
    store().trace({
      id: newId(),
      at: now(),
      queueItemId: item.id,
      event,
      errorKind: detail.errorKind ?? null,
      httpStatus: detail.httpStatus ?? null,
      latencyMs: detail.latencyMs === undefined ? null : Math.round(detail.latencyMs),
      attempt,
    });

  // «Qué se envió»: solo lo que salió de la PC, con lo que costó.
  const log = (
    item: AiQueueItem,
    current: AiProvider,
    status: AiRequestStatus,
    response: CompletionResponse | null,
  ) => {
    if (current.kind !== 'remote') {
      return 0;
    }
    const usage = response?.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const usdMicros = costMicros(usage, priceFor(EXPLAIN_FRAGMENT.model));
    store().logRequest({
      id: newId(),
      at: now(),
      purpose: EXPLAIN_FRAGMENT.id,
      provider: current.id,
      model: EXPLAIN_FRAGMENT.model,
      promptVersion: EXPLAIN_FRAGMENT.prompt.version,
      rubricVersion: EXPLAIN_FRAGMENT.rubricVersion,
      priceVersion: PRICES.version,
      fragments: [
        {
          materialId: item.materialId,
          title: item.materialTitle,
          chars: item.fragment.length,
          sha256: sha256(item.fragment),
        },
      ],
      usage,
      usdMicros,
      status,
      queueItemId: item.id,
    });
    return usdMicros;
  };

  // Un pedido de la cola. Devuelve falso si no hay conexión (no tiene sentido seguir).
  const sendOne = async (item: AiQueueItem): Promise<boolean> => {
    const current = provider();
    if (prefs().localOnly || current === null) {
      trace(item, 'cancelled', item.attempts);
      finish(item, { state: 'failed', requestId: item.id, reason: 'cancelled' });
      return true;
    }
    const request = requestOf(item.fragment, item.materialTitle);
    if (current.kind === 'remote') {
      const spent = monthSpentMicros();
      const { capCents } = prefs();
      if (!fitsUnderCap(spent, capCents, request.maxCost)) {
        finish(item, { state: 'blocked', reason: 'cap_reached', spentMicros: spent, capCents });
        return true;
      }
    }
    if (isOffline()) {
      store().markWaiting(item.id, 'offline', item.attempts);
      trace(item, 'offline', item.attempts);
      notify({ type: 'ai.pending', requestId: item.id });
      return false;
    }
    const attempt = item.attempts + 1;
    store().markSending(item.id, attempt);
    trace(item, 'sent', attempt);
    const elapsed = stopwatch.start();
    let response: CompletionResponse;
    try {
      response = await current.complete({
        model: EXPLAIN_FRAGMENT.model,
        system: request.system,
        user: request.user,
        schema: API_SCHEMA,
        maxTokens: EXPLAIN_FRAGMENT.maxTokens,
        effort: EXPLAIN_FRAGMENT.effort,
      });
    } catch (error) {
      const failure = error instanceof AiProviderError ? error : new AiProviderError('server');
      if (failure.kind === 'offline') {
        // No salió nada de la PC: no cuenta como intento.
        store().markWaiting(item.id, 'offline', item.attempts);
        trace(item, 'offline', item.attempts, { latencyMs: elapsed() });
        notify({ type: 'ai.pending', requestId: item.id });
        return false;
      }
      log(item, current, 'failed', null);
      trace(item, 'error', attempt, {
        errorKind: failure.kind,
        httpStatus: failure.status,
        latencyMs: elapsed(),
      });
      if (TRANSIENT.has(failure.kind) && attempt < MAX_ATTEMPTS) {
        store().markWaiting(item.id, 'retrying', attempt);
        notify({ type: 'ai.pending', requestId: item.id });
        return true;
      }
      const reason =
        failure.kind === 'auth' ? 'auth' : failure.kind === 'billing' ? 'billing' : 'technical';
      finish(item, { state: 'failed', requestId: item.id, reason });
      return true;
    }
    trace(item, 'answered', attempt, { latencyMs: elapsed() });
    if (response.stopReason === 'refusal') {
      log(item, current, 'refused', response);
      finish(item, { state: 'failed', requestId: item.id, reason: 'refused' });
      return true;
    }
    // Una respuesta cortada por largo no tiene la forma entera: se tira (CA-173).
    const parsed =
      response.stopReason === 'max_tokens'
        ? ({ ok: false } as const)
        : parseModelOutput(response.text, explainOutputSchema);
    if (!parsed.ok) {
      log(item, current, 'rejected_schema', response);
      finish(item, { state: 'failed', requestId: item.id, reason: 'format' });
      return true;
    }
    const micros = log(item, current, 'ok', response);
    store().saveCached({
      key: item.cacheKey,
      purpose: EXPLAIN_FRAGMENT.id,
      model: EXPLAIN_FRAGMENT.model,
      promptVersion: EXPLAIN_FRAGMENT.prompt.version,
      rubricVersion: EXPLAIN_FRAGMENT.rubricVersion,
      output: JSON.stringify(parsed.value),
      createdAt: now(),
    });
    finish(item, {
      state: 'done',
      requestId: item.id,
      result: verifyExplanation(parsed.value, item.fragment),
      cost: current.kind === 'remote' ? { kind: 'paid', micros } : { kind: 'simulated' },
      percentUsed: warningOf(current),
    });
    return true;
  };

  return {
    explain({ materialId, materialTitle, fragment, choice }) {
      const current = provider();
      const { capCents, localOnly } = prefs();
      const remote = current?.kind === 'remote';
      const request = requestOf(fragment, materialTitle);
      const key = current === null ? null : cacheKeyOf(current, materialTitle, fragment);
      const cachedText = key === null ? null : store().cached(key);
      const spentMicros = remote ? monthSpentMicros() : 0;
      const decision = decideRequest({
        functionState: functionStateOf(EXPLAIN_FRAGMENT.id),
        localOnly,
        provider: current === null ? 'none' : current.kind,
        fragmentChars: fragment.length,
        maxChars: EXPLAIN_FRAGMENT.maxChars,
        spentMicros,
        capCents,
        nextMaxMicros: request.maxCost,
        cached: cachedText !== null,
        permission: remote ? store().permission(materialId) : null,
        choice,
      });
      switch (decision.action) {
        case 'block': {
          if (decision.reason === 'permission_denied' && choice === 'never') {
            store().setPermission(materialId, 'never', now());
          }
          return { state: 'blocked', reason: decision.reason, spentMicros, capCents };
        }
        case 'ask_permission':
          return { state: 'needs_permission' };
        case 'serve_cache': {
          const parsed = parseModelOutput(cachedText, explainOutputSchema);
          const value: ExplainOutput = parsed.ok
            ? parsed.value
            : { fromMaterial: [], modelContribution: [] };
          return {
            state: 'done',
            requestId: newId(),
            result: verifyExplanation(value, fragment),
            cost: { kind: 'cached' },
            percentUsed: warningOf(current),
          };
        }
        case 'send': {
          if (remote && choice === 'always') {
            store().setPermission(materialId, 'always', now());
          }
          const existing = key === null ? null : store().pendingFor(key);
          if (existing) {
            return pendingOutcome(existing);
          }
          const item: AiQueueItem = {
            id: newId(),
            createdAt: now(),
            purpose: EXPLAIN_FRAGMENT.id,
            cacheKey: key ?? '',
            materialId,
            materialTitle,
            fragment,
            status: 'pending',
            attempts: 0,
            waiting: isOffline() ? 'offline' : 'sending',
            outcome: null,
            finishedAt: null,
          };
          store().enqueue(item);
          notify({ type: 'ai.pending', requestId: item.id });
          return pendingOutcome(item);
        }
      }
    },

    outcome(requestId) {
      const item = store().queueItem(requestId);
      if (!item) {
        return null;
      }
      return item.status === 'finished' && item.outcome !== null
        ? (JSON.parse(item.outcome) as AiOutcome)
        : pendingOutcome(item);
    },

    cancel(requestId) {
      const item = store().queueItem(requestId);
      if (item?.status === 'pending' || item?.status === 'sending') {
        trace(item, 'cancelled', item.attempts);
        finish(item, { state: 'failed', requestId, reason: 'cancelled' });
      }
      return this.outcome(requestId);
    },

    cancelPending() {
      for (const item of store().pendingItems()) {
        trace(item, 'cancelled', item.attempts);
        finish(item, { state: 'failed', requestId: item.id, reason: 'cancelled' });
      }
    },

    async sendPending() {
      for (const item of store().pendingItems()) {
        const fresh = store().queueItem(item.id);
        if (fresh?.status !== 'pending') {
          continue;
        }
        if (!(await sendOne(fresh))) {
          // Sin conexión: lo demás también espera.
          for (const rest of store().pendingItems()) {
            if (rest.waiting !== 'offline') {
              store().markWaiting(rest.id, 'offline', rest.attempts);
              notify({ type: 'ai.pending', requestId: rest.id });
            }
          }
          return;
        }
      }
    },

    monthSpentMicros,
    functionStateOf,
    recover: () => store().recoverSending(),
  };
}
