import { getTableName, isTable } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { EXCLUDED_TABLES, EXPORTED_TABLES } from '../../src/data/export';
import * as schema from '../../src/data/schema';

// «Exportar todo» (CA-127, CA-128) no puede perder una tabla en silencio: cada tabla del esquema
// está en la lista de las que se exportan o en la de las que no, con su motivo (las que se
// recalculan solas). Una tabla nueva sin clasificar pone la red en rojo.

const tables = Object.values(schema)
  .filter((value) => isTable(value))
  .map((table) => getTableName(table))
  .sort();

describe('las tablas de la exportación', () => {
  it('[CA-127] cada tabla del esquema se exporta o tiene su motivo para no exportarse', () => {
    const classified = [...EXPORTED_TABLES, ...Object.keys(EXCLUDED_TABLES)].sort();
    expect(classified).toEqual(tables);
  });

  it('[CA-128] ninguna tabla está en las dos listas', () => {
    for (const table of EXPORTED_TABLES) {
      expect(Object.keys(EXCLUDED_TABLES)).not.toContain(table);
    }
  });

  it('[CA-128] el historial y el contenido se exportan; las proyecciones no', () => {
    for (const table of [
      'observations',
      'evaluations',
      'operations',
      'cards',
      'card_versions',
      'notes',
      'blocks',
      'block_versions',
      'materials',
      'images',
      'imports',
      'import_items',
    ]) {
      expect(EXPORTED_TABLES).toContain(table);
    }
    for (const table of ['card_schedule', 'search_documents', 'ledger_state']) {
      expect(Object.keys(EXCLUDED_TABLES)).toContain(table);
    }
  });
});
