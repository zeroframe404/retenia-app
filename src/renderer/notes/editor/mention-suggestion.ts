import { MAX_TITLE_LENGTH } from '../../../preload/contract/notes';

export interface MentionTrigger {
  // Lo escrito después de «[[».
  query: string;
  // Cuántos caracteres ocupa todo, desde los corchetes hasta el cursor.
  length: number;
}

// «[[» y lo que sigue hasta el cursor, sin otro corchete en el medio (puede haber espacios).
const TRIGGER = /\[\[([^[\]]*)$/;

export function findMentionTrigger(textBeforeCursor: string): MentionTrigger | null {
  const match = TRIGGER.exec(textBeforeCursor);
  const query = match?.[1];
  if (match === null || query === undefined || query.length > MAX_TITLE_LENGTH) {
    return null;
  }
  return { query, length: match[0].length };
}
