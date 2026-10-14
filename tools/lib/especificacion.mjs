import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ id: string, given: string | null, when: string | null, outcome: string | null }} Criterion
 * @typedef {{ id: string, priority: string, phase: string, description: string, criteria: Criterion[] }} Story
 * @typedef {{ number: string, name: string, stories: string[], criteria: string[] }} Phase
 * @typedef {{ stories: Story[], phases: Phase[] }} Spec
 */

const STORY = /^## (H-\d{2}) · (Imprescindible|Importante) · Fase (\d{2})$/;
const CRITERION = /^- \*\*(CA-\d{3})\*\*$/;
const PHASE_ROW = /^\| (\d{2}) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| (\d+) \|$/;

/** @param {string} line @param {string} prefix */
function stripPrefix(line, prefix) {
  const text = line.trim();
  if (!text.startsWith(`- ${prefix} `)) {
    return null;
  }
  return text.slice(prefix.length + 3).replace(/,$/, '');
}

// «CA-038 a CA-047, CA-372 a CA-376» → ['CA-038', …, 'CA-047', 'CA-372', …].
/** @param {string} text @returns {string[]} */
export function expandRanges(text) {
  /** @type {string[]} */
  const ids = [];
  for (const part of text.split(',').map((t) => t.trim())) {
    const range = /^CA-(\d{3}) a CA-(\d{3})$/.exec(part);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) {
        ids.push(`CA-${String(n).padStart(3, '0')}`);
      }
    } else if (/^CA-\d{3}$/.test(part)) {
      ids.push(part);
    } else {
      throw new Error(`No entiendo el tramo de criterios «${part}»`);
    }
  }
  return ids;
}

// Lee docs/especificacion/historias.md: historias con sus criterios y la tabla «Criterio por fase».
/** @param {string} text @returns {Spec} */
export function parseSpec(text) {
  const lines = text.split(/\r?\n/);
  /** @type {Story[]} */
  const stories = [];
  /** @type {Phase[]} */
  const phases = [];
  /** @type {Story | null} */
  let current = null;
  let inPhaseTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('# ')) {
      inPhaseTable = line === '# Criterio por fase';
      current = null;
      continue;
    }
    if (inPhaseTable) {
      if (line.startsWith('## ')) {
        inPhaseTable = false;
        continue;
      }
      const row = PHASE_ROW.exec(line);
      if (row) {
        phases.push({
          number: row[1] ?? '',
          name: row[2] ?? '',
          stories: (row[3] ?? '').split(',').map((s) => s.trim()),
          criteria: expandRanges(row[4] ?? ''),
        });
      }
      continue;
    }
    const story = STORY.exec(line);
    if (story) {
      const description = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
      current = {
        id: story[1] ?? '',
        priority: story[2] ?? '',
        phase: story[3] ?? '',
        description: description.trim(),
        criteria: [],
      };
      stories.push(current);
      continue;
    }
    const criterion = CRITERION.exec(line);
    if (criterion && current) {
      current.criteria.push({
        id: criterion[1] ?? '',
        given: stripPrefix(lines[i + 1] ?? '', 'Dado'),
        when: stripPrefix(lines[i + 2] ?? '', 'cuando'),
        outcome: stripPrefix(lines[i + 3] ?? '', 'entonces'),
      });
    }
  }
  return { stories, phases };
}

/** @param {string} root @returns {Spec} */
export function readProjectSpec(root) {
  return parseSpec(readFileSync(join(root, 'docs', 'especificacion', 'historias.md'), 'utf8'));
}
