import type { Usage } from './cost';
import type { PermissionScope } from './gate-rules';

// Lo único que la compuerta de IA puede hacer con la base (Fase 19, CA-174): leer y escribir sus
// propias tablas. No recibe nada que toque tarjetas, repasos, historial ni dominio, así que ninguna
// respuesta de un modelo tiene cómo escribir ahí. Lo implementa src/data/ai.ts y lo arma el
// principal; vive en el núcleo porque los datos no importan de la IA (regla de capas R4).

// 'unanswered': salió de la PC y no llegó respuesta (la conexión se cortó, venció el tiempo o se
// cerró Retenia en el medio): pudo haber llegado a la IA y costado, así que cuenta lo máximo.
export type AiRequestStatus = 'ok' | 'rejected_schema' | 'refused' | 'failed' | 'unanswered';

// Un envío a la IA, para «Qué se envió» y el tope del mes: nunca el texto del pasaje ni la respuesta.
interface AiRequestRecord {
  readonly id: string;
  readonly at: string;
  readonly purpose: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: number;
  readonly rubricVersion: number | null;
  readonly priceVersion: string;
  readonly fragments: readonly {
    readonly materialId: string;
    readonly title: string;
    readonly chars: number;
    readonly sha256: string;
  }[];
  readonly usage: Usage;
  readonly usdMicros: number;
  readonly status: AiRequestStatus;
  readonly queueItemId: string;
}

// Un pedido en la cola. El pasaje se guarda solo hasta enviarlo (se borra al terminar).
export interface AiQueueItem {
  readonly id: string;
  readonly createdAt: string;
  readonly purpose: string;
  readonly cacheKey: string;
  readonly materialId: string;
  readonly materialTitle: string;
  readonly fragment: string;
  readonly status: 'pending' | 'sending' | 'finished';
  readonly attempts: number;
  // Por qué espera: se está mandando, no hay conexión o se reintenta después de un error técnico.
  readonly waiting: 'sending' | 'offline' | 'retrying';
  // El resultado (JSON del contrato `aiOutcomeSchema`), cuando terminó.
  readonly outcome: string | null;
  readonly finishedAt: string | null;
  // Con qué IA se pidió y con qué permiso: antes de salir se vuelve a mirar.
  readonly provider: string;
  readonly allowedBy: 'local' | 'once' | 'always';
}

// Las trazas técnicas: qué pasó con cada intento, sin textos. Se borran a los 90 días.
interface AiTraceRecord {
  readonly id: string;
  readonly at: string;
  readonly queueItemId: string;
  readonly event: 'sent' | 'answered' | 'error' | 'offline' | 'cancelled';
  readonly errorKind: string | null;
  readonly httpStatus: number | null;
  readonly latencyMs: number | null;
  readonly attempt: number;
}

export interface AiStorePort {
  spentMicros(range: { from: string; to: string }): number;
  cached(key: string): string | null;
  saveCached(entry: {
    key: string;
    purpose: string;
    model: string;
    promptVersion: number;
    rubricVersion: number | null;
    output: string;
    createdAt: string;
  }): void;
  logRequest(record: AiRequestRecord): void;
  trace(record: AiTraceRecord): void;
  permission(materialId: string): PermissionScope | null;
  setPermission(materialId: string, scope: PermissionScope, at: string): void;
  enqueue(item: AiQueueItem): void;
  queueItem(id: string): AiQueueItem | null;
  // Lo mismo pedido que todavía no terminó (esperando o en camino).
  pendingFor(cacheKey: string): AiQueueItem | null;
  pendingItems(): AiQueueItem[];
  markSending(id: string, attempts: number): void;
  markWaiting(id: string, waiting: 'offline' | 'retrying', attempts: number): void;
  finish(id: string, outcome: string, at: string): void;
  // Lo que quedó «enviándose» (un cierre de Retenia en medio de un envío).
  sendingItems(): AiQueueItem[];
}
