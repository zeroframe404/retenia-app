import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

// Lo que sirve tanto para la base abierta como para una transacción: así las escrituras se
// arman de a pedazos y van todas juntas en la misma transacción.
export type Writer = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;
