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
import type { AiQueueItem, AiRequestStatus, AiStorePort } from '../core/ai/ports';
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
// reintenta hasta 3 veces y se dice como error técnico. Lo que pudo haber salido de la PC (también un
// corte sin respuesta) queda en «Qué se envió»; si no se sabe lo que costó, cuenta lo máximo que pudo
// costar, así el tope nunca se pasa. Antes de salir, lo que espera en la cola se vuelve a mirar: si
// ya no puede salir (modo solo local, función suspendida, otra IA, sin permiso), se cancela.

export interface AiPrefs {
  readonly capCents: number;
  readonly localOnly: boolean;
  readonly suspended: readonly string[];
}

// Por qué se canceló un pedido que esperaba.
type CancelReason =
  | 'cancelled'
  | 'cancelled_local_only'
  | 'cancelled_suspended'
  | 'cancelled_permission'
  | 'cancelled_no_ai'
  | 'cancelled_ai_changed';

export interface AiGate {
  // Lo que se puede saber sin leer el pasaje (función suspendida, «Modo solo local», sin IA): si
  // corta, el pasaje ni se lee.
  precheck(): AiOutcome | null;
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
  // Vuelve a mirar lo que espera (después de quitar un permiso, suspender o borrar la clave): lo que
  // ya no puede salir se cancela.
  reviewPending(): void;
  // Manda lo pendiente, una vez cada pedido; lo que falla espera la próxima vuelta.
  sendPending(): Promise<void>;
  monthSpentMicros(): number;
  functionStateOf(id: string): AiFunctionState;
  // Al abrir: lo que quedó «enviándose» en un cierre pudo haber llegado; queda en «Qué se envió» con
  // lo máximo que pudo costar, cuenta como intento y vuelve a la cola.
  recover(): void;
}

const MAX_ATTEMPTS = 3;
const TRANSIENT = new Set(['busy', 'server', 'timeout', 'connection']);
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

  // «Qué se envió»: solo lo que salió de la PC con tu clave (la IA simulada no saca nada), con lo
  // que costó. Sin respuesta, lo máximo que pudo costar.
  const log = (item: AiQueueItem, status: AiRequestStatus, response: CompletionResponse | null) => {
    if (item.allowedBy === 'local') {
      return 0;
    }
    const usage = response?.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const usdMicros =
      status === 'unanswered'
        ? requestOf(item.fragment, item.materialTitle).maxCost
        : costMicros(usage, priceFor(EXPLAIN_FRAGMENT.model));
    store().logRequest({
      id: newId(),
      at: now(),
      purpose: EXPLAIN_FRAGMENT.id,
      provider: item.provider,
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

  // Lo que espera en la cola se vuelve a mirar antes de salir. Nulo si todavía puede salir.
  const cancelReasonOf = (item: AiQueueItem, current: AiProvider | null): CancelReason | null => {
    if (prefs().localOnly) {
      return 'cancelled_local_only';
    }
    if (functionStateOf(item.purpose) === 'suspended') {
      return 'cancelled_suspended';
    }
    if (current === null) {
      return 'cancelled_no_ai';
    }
    // La huella dice con qué IA (y qué variante) se pidió: si cambió, no sale por otra.
    if (
      current.id !== item.provider ||
      cacheKeyOf(current, item.materialTitle, item.fragment) !== item.cacheKey
    ) {
      return 'cancelled_ai_changed';
    }
    if (current.kind === 'remote') {
      const permission = store().permission(item.materialId);
      if (permission === 'never' || (item.allowedBy === 'always' && permission !== 'always')) {
        return 'cancelled_permission';
      }
    }
    return null;
  };

  const cancelItem = (item: AiQueueItem, reason: CancelReason) => {
    trace(item, 'cancelled', item.attempts);
    finish(item, { state: 'failed', requestId: item.id, reason });
  };

  // Se canceló mientras iba en camino: lo que vuelva ya no se muestra ni se reintenta.
  const cancelledMeanwhile = (item: AiQueueItem) =>
    store().queueItem(item.id)?.status !== 'sending';

  // Un pedido de la cola. Devuelve falso si no hay conexión (no tiene sentido seguir).
  const sendOne = async (item: AiQueueItem): Promise<boolean> => {
    const current = provider();
    const reason = cancelReasonOf(item, current);
    if (reason !== null || current === null) {
      cancelItem(item, reason ?? 'cancelled_no_ai');
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
        // La puerta de la PC no lo dejó salir: no salió nada y no cuenta como intento.
        if (!cancelledMeanwhile(item)) {
          store().markWaiting(item.id, 'offline', item.attempts);
          notify({ type: 'ai.pending', requestId: item.id });
        }
        trace(item, 'offline', item.attempts, { latencyMs: elapsed() });
        return false;
      }
      // Con respuesta de la IA (un código), no se cobra; sin respuesta, pudo haber llegado.
      log(item, failure.status === null ? 'unanswered' : 'failed', null);
      trace(item, 'error', attempt, {
        errorKind: failure.kind,
        httpStatus: failure.status,
        latencyMs: elapsed(),
      });
      if (cancelledMeanwhile(item)) {
        return true;
      }
      if (TRANSIENT.has(failure.kind) && attempt < MAX_ATTEMPTS) {
        store().markWaiting(item.id, 'retrying', attempt);
        notify({ type: 'ai.pending', requestId: item.id });
        return true;
      }
      const failed =
        failure.kind === 'auth' ? 'auth' : failure.kind === 'billing' ? 'billing' : 'technical';
      finish(item, { state: 'failed', requestId: item.id, reason: failed });
      return true;
    }
    trace(item, 'answered', attempt, { latencyMs: elapsed() });
    const stopped = cancelledMeanwhile(item);
    if (response.stopReason === 'refusal') {
      log(item, 'refused', response);
      if (!stopped) {
        finish(item, { state: 'failed', requestId: item.id, reason: 'refused' });
      }
      return true;
    }
    // Una respuesta cortada por largo no tiene la forma entera: se tira (CA-173).
    const parsed =
      response.stopReason === 'max_tokens'
        ? ({ ok: false } as const)
        : parseModelOutput(response.text, explainOutputSchema);
    if (!parsed.ok) {
      log(item, 'rejected_schema', response);
      if (!stopped) {
        finish(item, { state: 'failed', requestId: item.id, reason: 'format' });
      }
      return true;
    }
    const micros = log(item, 'ok', response);
    // Ya está pagada: si la pedís de nuevo, sale de lo guardado.
    store().saveCached({
      key: item.cacheKey,
      purpose: EXPLAIN_FRAGMENT.id,
      model: EXPLAIN_FRAGMENT.model,
      promptVersion: EXPLAIN_FRAGMENT.prompt.version,
      rubricVersion: EXPLAIN_FRAGMENT.rubricVersion,
      output: JSON.stringify(parsed.value),
      createdAt: now(),
    });
    if (!stopped) {
      finish(item, {
        state: 'done',
        requestId: item.id,
        result: verifyExplanation(parsed.value, item.fragment),
        cost: current.kind === 'remote' ? { kind: 'paid', micros } : { kind: 'simulated' },
        percentUsed: warningOf(current),
      });
    }
    return true;
  };

  return {
    precheck() {
      const current = provider();
      const { capCents, localOnly } = prefs();
      // La misma regla de siempre, con lo que todavía no se leyó en neutro.
      const decision = decideRequest({
        functionState: functionStateOf(EXPLAIN_FRAGMENT.id),
        localOnly,
        provider: current === null ? 'none' : current.kind,
        fragmentChars: 0,
        maxChars: EXPLAIN_FRAGMENT.maxChars,
        spentMicros: 0,
        capCents,
        nextMaxMicros: 0,
        cached: false,
        permission: 'always',
        choice: null,
      });
      if (
        decision.action !== 'block' ||
        !['suspended', 'local_only', 'not_connected'].includes(decision.reason)
      ) {
        return null;
      }
      const spentMicros = current?.kind === 'remote' ? monthSpentMicros() : 0;
      return { state: 'blocked', reason: decision.reason, spentMicros, capCents };
    },

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
            provider: current?.id ?? '',
            allowedBy: !remote ? 'local' : choice === 'once' ? 'once' : 'always',
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
        cancelItem(item, 'cancelled');
      }
      return this.outcome(requestId);
    },

    cancelPending() {
      for (const item of store().pendingItems()) {
        cancelItem(item, 'cancelled_local_only');
      }
    },

    reviewPending() {
      const current = provider();
      for (const item of store().pendingItems()) {
        const reason = cancelReasonOf(item, current);
        if (reason !== null) {
          cancelItem(item, reason);
        }
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
    recover() {
      for (const item of store().sendingItems()) {
        log(item, 'unanswered', null);
        trace(item, 'error', item.attempts, { errorKind: 'interrupted' });
        if (item.attempts >= MAX_ATTEMPTS) {
          finish(item, { state: 'failed', requestId: item.id, reason: 'technical' });
        } else {
          store().markWaiting(item.id, 'retrying', item.attempts);
        }
      }
    },
  };
}
