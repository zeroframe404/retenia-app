import { type AiGate, createAiGate } from '../../ai/gate';
import { AI_MODELS, MODEL_NOT_BEFORE } from '../../ai/models';
import { type AiProvider, AiProviderError } from '../../ai/provider';
import { capState, percentUsed, retiresSoon } from '../../core/ai';
import { type Clock, type Stopwatch, systemStopwatch } from '../../core/clock';
import { localDateTime } from '../../core/study-day';
import type { AiStore } from '../../data/ai';
import {
  AI_FUNCTION_IDS,
  type AiConnection,
  type AiOutcome,
  type AiPermissions,
  type AiSentLog,
  type AiStatus,
} from '../../preload/contract/ai';
import type { AiEvent } from '../../preload/contract/events';
import type { MaterialSelection } from '../../preload/contract/materials';
import type { NetGate } from '../net-gate';
import { createKeyStore, InsecureStorageError, type SecretBox } from './key-store';
import { createAiPrefsStore } from './prefs';

// La IA del lado del principal (Fase 19): arma la compuerta (src/ai/gate.ts) con la clave guardada
// en el almacén seguro, los ajustes de `ajustes.json`, la puerta única a internet y el almacén de la
// IA, y lleva la cola: arranca al abrir, sigue al volver la conexión y cada 30 segundos. Nunca frena
// el estudio: un pedido vuelve enseguida («Pendiente…») y el resultado llega por un aviso.

const RETRY_EVERY_MS = 30_000;
const DAY_MS = 86_400_000;
const TRACES_DAYS = 90;

export interface AiService {
  status(): AiStatus;
  testConnection(request: { key?: string | undefined }): Promise<AiConnection>;
  deleteKey(): AiStatus;
  setCap(request: { capCents: number }): AiStatus;
  setLocalOnly(request: { on: boolean }): AiStatus;
  setFunctionState(request: { functionId: string; suspended: boolean }): AiStatus;
  sentLog(): AiSentLog;
  permissions(): AiPermissions;
  revokePermission(request: { materialId: string }): AiPermissions;
  explain(request: {
    materialId: string;
    selection: MaterialSelection;
    permission?: 'once' | 'always' | 'never' | undefined;
  }): AiOutcome;
  outcome(request: { requestId: string }): AiOutcome;
  cancel(request: { requestId: string }): AiOutcome;
  // La cola: arrancarla (al abrir), mandar lo pendiente ya y frenarla.
  start(): void;
  stop(): void;
  drain(): Promise<void>;
  // Mientras se restaura una copia, la cola espera (la base se cierra y se reemplaza).
  pause(): Promise<void>;
  unpause(): void;
}

export interface AiTimers {
  every(ms: number, run: () => void): () => void;
}

const REAL_TIMERS: AiTimers = {
  every(ms, run) {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};

function connectionResult(error: unknown): AiConnection['result'] {
  const kind = error instanceof AiProviderError ? error.kind : 'server';
  if (kind === 'auth') {
    return 'invalid_key';
  }
  if (kind === 'offline') {
    return 'offline';
  }
  return kind === 'model_unavailable' ? 'model_unavailable' : 'technical';
}

export function createAiService({
  store,
  clock,
  dataDir,
  box,
  net,
  newId,
  fragmentOf,
  remote,
  simulated,
  emit = () => undefined,
  timers = REAL_TIMERS,
  stopwatch = systemStopwatch(),
}: {
  // El almacén de la IA vigente (después de restaurar una copia, la base es otra).
  store: () => AiStore;
  clock: Clock;
  dataDir: string;
  box: SecretBox;
  net: NetGate;
  newId: () => string;
  // El texto de una selección del visor, leído de tu material guardado (no de la pantalla).
  fragmentOf: (input: { materialId: string; selection: MaterialSelection }) => {
    text: string;
    title: string;
  };
  // La IA que gasta, armada con tu clave (en el programa, Anthropic por la puerta única).
  remote: (apiKey: string) => AiProvider;
  // La IA simulada de la demostración, cuando está prendida.
  simulated?: () => AiProvider | null;
  emit?: (event: AiEvent) => void;
  timers?: AiTimers;
  stopwatch?: Stopwatch;
}): AiService {
  const keys = createKeyStore({ dataDir, box });
  const prefs = createAiPrefsStore(dataDir);
  const providerNow = (): AiProvider | null => {
    const demo = simulated?.() ?? null;
    if (demo) {
      return demo;
    }
    const key = keys.read();
    return key === null ? null : remote(key);
  };
  const gate: AiGate = createAiGate({
    store,
    clock,
    newId,
    prefs: () => prefs.get(),
    provider: providerNow,
    isOffline: () => net.isOffline(),
    notify: emit,
    stopwatch,
  });

  const status = (): AiStatus => {
    const { capCents, localOnly } = prefs.get();
    const spentMicros = gate.monthSpentMicros();
    const keySaved = keys.has();
    return {
      provider: simulated?.() ? 'simulated' : keySaved ? 'anthropic' : 'none',
      keySaved,
      secureStorage: keys.secure(),
      localOnly,
      capCents,
      spentMicros,
      capState: capState(spentMicros, capCents),
      percentUsed: percentUsed(spentMicros, capCents),
      functions: AI_FUNCTION_IDS.map((id) => ({ id, state: gate.functionStateOf(id) })),
    };
  };
  const connection = (
    result: AiConnection['result'],
    retiresOn: string | null = null,
  ): AiConnection => ({ result, retiresOn, status: status() });

  // La cola, una vuelta por vez. Si alguien la pide mientras corre, da otra vuelta al terminar.
  let inFlight: Promise<void> | null = null;
  let again = false;
  let paused = 0;
  const loop = async () => {
    do {
      again = false;
      if (paused > 0) {
        return;
      }
      try {
        await gate.sendPending();
      } catch {
        // Lo que no se pudo anotar queda pendiente y sale en la próxima vuelta (o al volver a abrir).
        return;
      }
    } while (again);
  };
  const drain = (): Promise<void> => {
    if (paused > 0) {
      return Promise.resolve();
    }
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = loop().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  let stopTimer: (() => void) | null = null;
  let stopListening: (() => void) | null = null;

  const known = (outcome: AiOutcome | null): AiOutcome => {
    if (outcome === null) {
      throw new Error('No encontré ese pedido a la IA');
    }
    return outcome;
  };

  return {
    status,

    async testConnection({ key }) {
      if (prefs.get().localOnly) {
        return connection('local_only');
      }
      const candidate = key ?? keys.read();
      if (candidate === null) {
        return connection('no_key');
      }
      if (key !== undefined && !keys.secure()) {
        return connection('insecure');
      }
      const { model } = AI_MODELS.explain_fragment;
      try {
        await remote(candidate).testConnection(model);
      } catch (error) {
        return connection(connectionResult(error));
      }
      if (key !== undefined) {
        try {
          keys.save(key);
        } catch (error) {
          if (error instanceof InsecureStorageError) {
            return connection('insecure');
          }
          throw error;
        }
      }
      const notBefore = MODEL_NOT_BEFORE[model];
      const today = localDateTime(clock.now()).day;
      return connection(
        'ok',
        notBefore !== undefined && retiresSoon(today, notBefore) ? notBefore : null,
      );
    },

    deleteKey() {
      keys.remove();
      return status();
    },

    setCap({ capCents }) {
      prefs.set({ capCents });
      return status();
    },

    setLocalOnly({ on }) {
      prefs.set({ localOnly: on });
      net.setLocalOnly(on);
      if (on) {
        gate.cancelPending();
      } else {
        void drain();
      }
      return status();
    },

    setFunctionState({ functionId, suspended }) {
      const next = new Set(prefs.get().suspended);
      if (suspended) {
        next.add(functionId);
      } else {
        next.delete(functionId);
      }
      prefs.set({ suspended: [...next] });
      return status();
    },

    sentLog: () => store().sentLog(),
    permissions: () => store().permissions(),
    revokePermission({ materialId }) {
      store().revokePermission(materialId);
      return store().permissions();
    },

    explain({ materialId, selection, permission }) {
      const { text, title } = fragmentOf({ materialId, selection });
      const outcome = gate.explain({
        materialId,
        materialTitle: title,
        fragment: text,
        choice: permission ?? null,
      });
      if (outcome.state === 'pending') {
        void drain();
      }
      return outcome;
    },

    outcome: ({ requestId }) => known(gate.outcome(requestId)),
    cancel: ({ requestId }) => known(gate.cancel(requestId)),

    start() {
      gate.recover();
      const now = clock.now().getTime();
      store().purge({
        tracesBefore: new Date(now - TRACES_DAYS * DAY_MS).toISOString(),
        finishedBefore: new Date(now - DAY_MS).toISOString(),
      });
      const { localOnly } = prefs.get();
      net.setLocalOnly(localOnly);
      if (localOnly) {
        gate.cancelPending();
      }
      stopListening?.();
      stopListening = net.onChange((offline) => {
        if (!offline) {
          void drain();
        }
      });
      stopTimer?.();
      stopTimer = timers.every(RETRY_EVERY_MS, () => {
        void drain();
      });
      void drain();
    },

    stop() {
      stopTimer?.();
      stopTimer = null;
      stopListening?.();
      stopListening = null;
    },

    drain,

    async pause() {
      paused++;
      await inFlight;
    },

    unpause() {
      paused = Math.max(0, paused - 1);
      if (paused === 0) {
        void drain();
      }
    },
  };
}
