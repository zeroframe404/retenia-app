import { and, eq, inArray } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import { generateVariant, type VariantFamily } from '../core/variants';
import { appendObservation, readPayload } from './ledger';
import type { Writer } from './orm';
import { observations } from './schema';

// Qué variante de un problema se muestra (Fase 18, CA-164). Cada variante que se ve queda anotada.
// Mientras no la contestes, el mismo día se vuelve a mostrar la misma; cuando la contestaste, o
// cambió el día, sale la siguiente de la familia, que trae otros números.

export interface ShownVariant {
  readonly n: number;
  readonly values: Readonly<Record<string, number>>;
}

interface Seen extends ShownVariant {
  readonly openingId: string;
  readonly versionId: string;
  readonly day: string;
}

const KINDS = ['variant.seen', 'attempt.submitted', 'procedure.studied'];

// Las variantes vistas de una tarjeta, en orden, y las que ya se contestaron (con un intento o con
// el ejemplo explicado).
export function variantHistory(
  db: Writer,
  cardId: string,
): { seen: Seen[]; practiced: Set<number> } {
  const rows = db
    .select({
      kind: observations.kind,
      payload: observations.payload,
      schemaVersion: observations.schemaVersion,
      at: observations.occurredAt,
    })
    .from(observations)
    .where(and(eq(observations.cardId, cardId), inArray(observations.kind, KINDS)))
    .orderBy(observations.seq)
    .all();
  const seen: Seen[] = [];
  const practiced = new Set<number>();
  for (const row of rows) {
    if (row.kind === 'variant.seen') {
      const payload = readPayload('variant.seen', row.schemaVersion, row.payload);
      seen.push({ ...payload, day: studyDayOf(new Date(row.at)) });
    } else if (row.kind === 'attempt.submitted') {
      const { variant } = readPayload('attempt.submitted', row.schemaVersion, row.payload);
      if (variant !== undefined) {
        practiced.add(variant.n);
      }
    } else {
      const { openingId } = readPayload('procedure.studied', row.schemaVersion, row.payload);
      const shown = seen.find((item) => item.openingId === openingId);
      if (shown !== undefined) {
        practiced.add(shown.n);
      }
    }
  }
  return { seen, practiced };
}

// La variante de una apertura (siempre la misma para la misma apertura).
export function variantOfOpening(db: Writer, cardId: string, openingId: string): Seen | null {
  return variantHistory(db, cardId).seen.find((item) => item.openingId === openingId) ?? null;
}

export function showVariant(
  tx: Writer,
  clock: Clock,
  input: { cardId: string; versionId: string; family: VariantFamily; openingId: string },
): ShownVariant {
  const { seen, practiced } = variantHistory(tx, input.cardId);
  const own = seen.find((item) => item.openingId === input.openingId);
  if (own) {
    return { n: own.n, values: own.values };
  }
  const last = seen.at(-1);
  const pending =
    last !== undefined &&
    last.versionId === input.versionId &&
    last.day === studyDayOf(clock.now()) &&
    !practiced.has(last.n);
  const n = last === undefined ? 0 : pending ? last.n : last.n + 1;
  const values = pending
    ? { ...last.values }
    : { ...generateVariant(input.family, input.cardId, n).values };
  appendObservation(tx, clock, {
    kind: 'variant.seen',
    payload: {
      cardId: input.cardId,
      versionId: input.versionId,
      openingId: input.openingId,
      n,
      values,
    },
    idempotencyKey: `variant:${input.openingId}`,
    source: 'user',
  });
  return { n, values };
}

// Una variante «que no habías visto» (CA-165): nunca contestada, de un problema del que ya viste
// otra.
export function isNewVariant(db: Writer, cardId: string, n: number): boolean {
  const { seen, practiced } = variantHistory(db, cardId);
  return !practiced.has(n) && seen.some((item) => item.n !== n);
}
