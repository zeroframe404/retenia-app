import { type SQL, sql } from 'drizzle-orm';
import {
  compareHits,
  foldText,
  fragmentOf,
  groupOf,
  matchPlan,
  parseSearchQuery,
  plainTitle,
  type RankedHit,
  relevanceOf,
  type SearchKind,
  titleMatch,
} from '../core/search';
import type { DataDifference } from '../preload/contract/backups';
import type { SearchHit, SearchResponse } from '../preload/contract/search';
import type { ReteniaDatabase } from './database';
import type { Writer } from './orm';
import { flushSearchIndex, rebuildSearchIndex, verifySearchIndex } from './search-index';

// La búsqueda (H-23 y H-24): consulta los dos índices, ordena y arma lo que ve la ventana.

export interface SearchStore {
  query(input: { text: string }): SearchResponse;
  // Anota que abriste un resultado: sin texto, el buscador muestra lo abierto hace poco.
  opened(input: { docId: string }): void;
  // «Reconstruir índice de búsqueda»: lo vuelve a armar desde el contenido.
  rebuild(): { documents: number };
  // Lo que el índice tiene distinto del contenido (nada si está al día).
  verify(): DataDifference[];
}

// Cuántos candidatos se traen del índice antes de ordenarlos y quedarse con los primeros.
const CANDIDATES = 1000;
const MAX_RESULTS = 50;
const MAX_RECENT = 20;
const KEEP_RECENT = 30;
const FRAGMENT_LENGTH = 140;
const TITLE_LENGTH = 200;

interface Row {
  doc_id: string;
  kind: SearchKind;
  entity_id: string;
  parent_id: string | null;
  subject_id: string | null;
  topic_id: string | null;
  label: string;
  title: string;
  body: string;
  aliases: string;
  archived: number;
  touched_at: string;
  subject_name: string | null;
  subject_status: string | null;
  topic_name: string | null;
  seq: number | null;
  rank: number;
}

// Los nombres de temas son pocos: siempre se piden aparte, para que la coincidencia exacta con un
// nombre viejo no se pierda entre miles de tarjetas.
const TOPIC_EXTRA = 50;

const SELECT = sql`d.doc_id, d.kind, d.entity_id, d.parent_id, d.subject_id, d.topic_id, d.label,
  d.title, d.body, d.aliases, d.archived, d.touched_at, s.name AS subject_name,
  s.status AS subject_status, t.name AS topic_name, r.seq AS seq`;
const JOINS = sql`LEFT JOIN subjects s ON s.id = d.subject_id
  LEFT JOIN topics t ON t.id = d.topic_id AND t.deleted_at IS NULL
  LEFT JOIN search_recent r ON r.doc_id = d.doc_id`;

const list = (values: readonly string[]): SQL =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();

function hitOf(row: Row, terms: readonly string[]): SearchHit {
  const source =
    row.kind === 'card' || row.kind === 'block'
      ? row.body
      : row.kind === 'topic'
        ? row.aliases.split('\n').join(' · ')
        : '';
  return {
    docId: row.doc_id,
    kind: row.kind,
    group: groupOf(row.kind),
    entityId: row.entity_id,
    parentId: row.parent_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    topicId: row.topic_id,
    topicName: row.topic_name,
    title: fragmentOf(collapse(row.label), terms, TITLE_LENGTH),
    fragment: fragmentOf(collapse(source), terms, FRAGMENT_LENGTH),
    archived: row.archived === 1 || row.subject_status === 'archived',
  };
}

export function createSearchStore(db: ReteniaDatabase): SearchStore {
  const { orm } = db;

  // Por si algo se escribió sin pasar por una transacción: lo pendiente se indexa antes de buscar.
  const catchUp = () => {
    if (orm.get(sql`SELECT 1 AS pending FROM search_dirty LIMIT 1`) !== undefined) {
      orm.transaction((tx) => {
        flushSearchIndex(tx);
      });
    }
  };

  // Los identificadores de las materias o los temas cuyo nombre (o nombre viejo) contiene lo escrito.
  const subjectIdsLike = (text: string): string[] => {
    const wanted = foldText(text);
    return orm
      .all<{ id: string; name: string }>(
        sql`SELECT id, name FROM subjects WHERE deleted_at IS NULL`,
      )
      .filter((row) => foldText(row.name).includes(wanted))
      .map((row) => row.id);
  };
  const topicIdsLike = (text: string): string[] => {
    const wanted = foldText(text);
    const found = new Set<string>();
    for (const row of orm.all<{ id: string; name: string }>(
      sql`SELECT id, name FROM topics WHERE deleted_at IS NULL`,
    )) {
      if (foldText(row.name).includes(wanted)) {
        found.add(row.id);
      }
    }
    for (const row of orm.all<{ topic_id: string; name: string }>(
      sql`SELECT topic_id, name FROM topic_aliases`,
    )) {
      if (foldText(row.name).includes(wanted)) {
        found.add(row.topic_id);
      }
    }
    return [...found];
  };

  function recent(): SearchResponse {
    const rows = orm.all<Row>(sql`SELECT ${SELECT}, 0 AS rank
      FROM search_recent r JOIN search_documents d ON d.doc_id = r.doc_id
      LEFT JOIN subjects s ON s.id = d.subject_id
      LEFT JOIN topics t ON t.id = d.topic_id AND t.deleted_at IS NULL
      WHERE (s.id IS NULL OR s.deleted_at IS NULL)
      ORDER BY r.seq DESC LIMIT ${MAX_RECENT}`);
    return { results: rows.map((row) => hitOf(row, [])), recent: true };
  }

  return {
    query({ text }) {
      catchUp();
      const parsed = parseSearchQuery(text);
      const plain = parsed.terms.length === 0;
      if (plain && parsed.types === null && parsed.subject === null && parsed.topic === null) {
        return recent();
      }
      const none: SearchResponse = { results: [], recent: false };
      if (parsed.types?.length === 0) {
        return none;
      }
      const plan = matchPlan(parsed.terms);
      if (plan.impossible) {
        return none;
      }
      const conditions: SQL[] = [sql`(s.id IS NULL OR s.deleted_at IS NULL)`];
      if (parsed.types) {
        conditions.push(sql`d.kind IN (${list(parsed.types)})`);
      }
      if (parsed.subject !== null) {
        const ids = subjectIdsLike(parsed.subject);
        if (ids.length === 0) {
          return none;
        }
        conditions.push(sql`d.subject_id IN (${list(ids)})`);
      }
      if (parsed.topic !== null) {
        const ids = topicIdsLike(parsed.topic);
        if (ids.length === 0) {
          return none;
        }
        conditions.push(sql`d.topic_id IN (${list(ids)})`);
      }
      const where = sql.join(conditions, sql` AND `);

      const fetch = (condition: SQL, limit: number): Row[] => {
        if (plan.pieces !== null) {
          const extra = plan.words
            ? sql` AND d.id IN (SELECT rowid FROM search_words WHERE search_words MATCH ${plan.words})`
            : sql``;
          return orm.all<Row>(sql`SELECT ${SELECT}, m.rank AS rank
            FROM (SELECT rowid AS rid, bm25(search_pieces, 10.0, 1.0, 1.0) AS rank
                  FROM search_pieces WHERE search_pieces MATCH ${plan.pieces}) m
            JOIN search_documents d ON d.id = m.rid ${JOINS}
            WHERE ${condition}${extra} ORDER BY m.rank LIMIT ${limit}`);
        }
        if (plan.words !== null) {
          return orm.all<Row>(sql`SELECT ${SELECT}, m.rank AS rank
            FROM (SELECT rowid AS rid, bm25(search_words, 10.0, 1.0) AS rank
                  FROM search_words WHERE search_words MATCH ${plan.words}) m
            JOIN search_documents d ON d.id = m.rid ${JOINS}
            WHERE ${condition} ORDER BY m.rank LIMIT ${limit}`);
        }
        return orm.all<Row>(sql`SELECT ${SELECT}, 0 AS rank
          FROM search_documents d ${JOINS}
          WHERE ${condition} ORDER BY d.touched_at DESC LIMIT ${limit}`);
      };
      const rows = fetch(where, CANDIDATES);
      if (plan.pieces !== null || plan.words !== null) {
        const seen = new Set(rows.map((row) => row.doc_id));
        for (const row of fetch(sql`${where} AND d.kind = 'topic'`, TOPIC_EXTRA)) {
          if (!seen.has(row.doc_id)) {
            rows.push(row);
          }
        }
      }

      const wanted = plainTitle(parsed.terms.join(' '));
      const ranked = rows.map((row) => {
        const names = [row.title, ...row.aliases.split('\n')];
        const hit: RankedHit = {
          id: row.doc_id,
          kind: row.kind,
          exact: wanted !== '' && names.some((name) => name !== '' && plainTitle(name) === wanted),
          relevance: relevanceOf(
            row.kind,
            titleMatch(row.title, parsed.terms),
            parsed.terms.length,
          ),
          activeSubject: row.subject_status === 'active',
          archived: row.archived === 1 || row.subject_status === 'archived',
          openedAt: row.seq === null ? null : String(row.seq).padStart(12, '0'),
          touchedAt: row.touched_at,
        };
        return { row, hit };
      });
      ranked.sort((a, b) => compareHits(a.hit, b.hit));
      return {
        results: ranked.slice(0, MAX_RESULTS).map(({ row }) => hitOf(row, parsed.terms)),
        recent: false,
      };
    },

    opened({ docId }) {
      orm.transaction((tx) => {
        const next = tx.get<{ n: number }>(
          sql`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM search_recent`,
        );
        tx.run(
          sql`INSERT INTO search_recent (doc_id, seq) VALUES (${docId}, ${next?.n ?? 1})
            ON CONFLICT(doc_id) DO UPDATE SET seq = excluded.seq`,
        );
        tx.run(
          sql`DELETE FROM search_recent WHERE doc_id NOT IN
            (SELECT doc_id FROM search_recent ORDER BY seq DESC LIMIT ${KEEP_RECENT})`,
        );
      });
    },

    rebuild() {
      const documents = orm.transaction((tx) => rebuildSearchIndex(tx));
      return { documents };
    },

    verify() {
      catchUp();
      return differencesOf(orm);
    },
  };
}

function differencesOf(tx: Writer): DataDifference[] {
  return verifySearchIndex(tx).map((difference) => ({
    cardId: null,
    question: difference.label,
    kind: 'search' as const,
    storedDay: null,
    expectedDay: null,
  }));
}
