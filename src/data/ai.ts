import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { AiQueueItem, AiStorePort } from '../core/ai/ports';
import { localDateTime } from '../core/study-day';
import type { AiPermissions, AiSentLog } from '../preload/contract/ai';
import type { ReteniaDatabase } from './database';
import { aiCache, aiMaterialPermissions, aiQueue, aiRequests, aiTraces, materials } from './schema';

// El almacén de la compuerta de IA (Fase 19): lo único que la compuerta puede tocar de la base. Solo
// escribe en las tablas de la IA (lo controla una prueba estática); de lo demás solo lee el título
// de los materiales para la lista de permisos.

export interface AiStore extends AiStorePort {
  sentLog(): AiSentLog;
  permissions(): AiPermissions;
  revokePermission(materialId: string): void;
  // Las trazas técnicas duran 90 días; los pedidos terminados se borran de la cola al día siguiente.
  purge(input: { tracesBefore: string; finishedBefore: string }): void;
}

type QueueRow = typeof aiQueue.$inferSelect;

const WAITING = new Set(['sending', 'offline', 'retrying']);
const STATUS = new Set(['pending', 'sending', 'finished']);
const ALLOWED_BY = new Set(['local', 'once', 'always']);

function itemOf(row: QueueRow): AiQueueItem {
  return {
    ...row,
    status: STATUS.has(row.status) ? (row.status as AiQueueItem['status']) : 'finished',
    waiting: WAITING.has(row.waiting) ? (row.waiting as AiQueueItem['waiting']) : 'sending',
    allowedBy: ALLOWED_BY.has(row.allowedBy) ? (row.allowedBy as AiQueueItem['allowedBy']) : 'once',
  };
}

const SENT_STATUS = new Set(['ok', 'rejected_schema', 'refused', 'failed', 'unanswered']);

export function createAiStore(db: ReteniaDatabase): AiStore {
  const { orm } = db;
  return {
    spentMicros({ from, to }) {
      const row = orm
        .select({ total: sql<number>`coalesce(sum(${aiRequests.usdMicros}), 0)` })
        .from(aiRequests)
        .where(and(gte(aiRequests.at, from), lt(aiRequests.at, to)))
        .get();
      return Number(row?.total ?? 0);
    },

    cached(key) {
      return (
        orm.select({ output: aiCache.output }).from(aiCache).where(eq(aiCache.key, key)).get()
          ?.output ?? null
      );
    },

    saveCached(entry) {
      orm
        .insert(aiCache)
        .values(entry)
        .onConflictDoUpdate({
          target: aiCache.key,
          set: { output: entry.output, createdAt: entry.createdAt },
        })
        .run();
    },

    logRequest(record) {
      orm
        .insert(aiRequests)
        .values({
          id: record.id,
          at: record.at,
          purpose: record.purpose,
          provider: record.provider,
          model: record.model,
          promptVersion: record.promptVersion,
          rubricVersion: record.rubricVersion,
          priceVersion: record.priceVersion,
          fragments: JSON.stringify(record.fragments),
          inputTokens: record.usage.inputTokens,
          outputTokens: record.usage.outputTokens,
          cacheReadTokens: record.usage.cacheReadTokens,
          cacheWriteTokens: record.usage.cacheWriteTokens,
          usdMicros: record.usdMicros,
          status: record.status,
          queueItemId: record.queueItemId,
        })
        .onConflictDoNothing({ target: aiRequests.id })
        .run();
    },

    trace(record) {
      orm.insert(aiTraces).values(record).onConflictDoNothing({ target: aiTraces.id }).run();
    },

    permission(materialId) {
      const scope = orm
        .select({ scope: aiMaterialPermissions.scope })
        .from(aiMaterialPermissions)
        .where(eq(aiMaterialPermissions.materialId, materialId))
        .get()?.scope;
      return scope === 'always' || scope === 'never' ? scope : null;
    },

    setPermission(materialId, scope, at) {
      orm
        .insert(aiMaterialPermissions)
        .values({ materialId, scope, decidedAt: at })
        .onConflictDoUpdate({
          target: aiMaterialPermissions.materialId,
          set: { scope, decidedAt: at },
        })
        .run();
    },

    revokePermission(materialId) {
      orm
        .delete(aiMaterialPermissions)
        .where(eq(aiMaterialPermissions.materialId, materialId))
        .run();
    },

    enqueue(item) {
      orm.insert(aiQueue).values(item).onConflictDoNothing({ target: aiQueue.id }).run();
    },

    queueItem(id) {
      const row = orm.select().from(aiQueue).where(eq(aiQueue.id, id)).get();
      return row ? itemOf(row) : null;
    },

    pendingFor(cacheKey) {
      const row = orm
        .select()
        .from(aiQueue)
        .where(and(eq(aiQueue.cacheKey, cacheKey), inArray(aiQueue.status, ['pending', 'sending'])))
        .get();
      return row ? itemOf(row) : null;
    },

    pendingItems() {
      return orm
        .select()
        .from(aiQueue)
        .where(eq(aiQueue.status, 'pending'))
        .orderBy(asc(aiQueue.createdAt), asc(aiQueue.id))
        .all()
        .map(itemOf);
    },

    markSending(id, attempts) {
      orm
        .update(aiQueue)
        .set({ status: 'sending', waiting: 'sending', attempts })
        .where(eq(aiQueue.id, id))
        .run();
    },

    markWaiting(id, waiting, attempts) {
      orm
        .update(aiQueue)
        .set({ status: 'pending', waiting, attempts })
        .where(eq(aiQueue.id, id))
        .run();
    },

    finish(id, outcome, at) {
      // El pasaje ya no hace falta: no queda guardado en la cola.
      orm
        .update(aiQueue)
        .set({ status: 'finished', outcome, finishedAt: at, fragment: '' })
        .where(eq(aiQueue.id, id))
        .run();
    },

    sendingItems() {
      return orm
        .select()
        .from(aiQueue)
        .where(eq(aiQueue.status, 'sending'))
        .orderBy(asc(aiQueue.createdAt), asc(aiQueue.id))
        .all()
        .map(itemOf);
    },

    sentLog() {
      const rows = orm
        .select()
        .from(aiRequests)
        .orderBy(desc(aiRequests.at), desc(aiRequests.id))
        .limit(500)
        .all();
      return {
        rows: rows.map((row) => {
          const fragments = JSON.parse(row.fragments) as { title: string }[];
          return {
            id: row.id,
            day: localDateTime(new Date(row.at)).day,
            purpose: 'explain_fragment' as const,
            materialTitle: fragments[0]?.title ?? '',
            fragmentCount: Math.max(1, fragments.length),
            costMicros: row.usdMicros,
            status: SENT_STATUS.has(row.status)
              ? (row.status as AiSentLog['rows'][number]['status'])
              : 'failed',
          };
        }),
      };
    },

    permissions() {
      const rows = orm
        .select({
          materialId: aiMaterialPermissions.materialId,
          scope: aiMaterialPermissions.scope,
          title: materials.title,
        })
        .from(aiMaterialPermissions)
        .innerJoin(materials, eq(materials.id, aiMaterialPermissions.materialId))
        .orderBy(asc(materials.title))
        .all();
      return {
        rows: rows.flatMap((row) =>
          row.scope === 'always' || row.scope === 'never'
            ? [{ materialId: row.materialId, title: row.title, scope: row.scope }]
            : [],
        ),
      };
    },

    purge({ tracesBefore, finishedBefore }) {
      orm.delete(aiTraces).where(lt(aiTraces.at, tracesBefore)).run();
      orm
        .delete(aiQueue)
        .where(and(eq(aiQueue.status, 'finished'), lt(aiQueue.finishedAt, finishedBefore)))
        .run();
    },
  };
}

// «Qué se envió» no vuelve atrás al restaurar una copia (objeción del revisor, CA-169 y CA-171): lo
// que salió de la PC salió, y lo gastado en el mes sigue contando para el tope. Los envíos de la base
// de hoy que la copia no tiene se le agregan antes de ponerla en su lugar (solo se agrega, como
// permiten los disparadores).
export function carrySentLog(from: ReteniaDatabase['orm'], into: ReteniaDatabase['orm']): void {
  const present = new Set(
    into
      .select({ id: aiRequests.id })
      .from(aiRequests)
      .all()
      .map((row) => row.id),
  );
  const missing = from
    .select()
    .from(aiRequests)
    .all()
    .filter((row) => !present.has(row.id));
  for (let start = 0; start < missing.length; start += 200) {
    into
      .insert(aiRequests)
      .values(missing.slice(start, start + 200))
      .run();
  }
}
