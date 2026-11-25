import { normalizeShortAnswer } from '../evaluation';

// El texto de un objetivo (H-34): una acción observable («Interpretar») y su contenido («un
// intervalo de confianza»). El concepto es el contenido sin el artículo del principio, sin
// mayúsculas ni tildes: dos objetivos con el mismo contenido comparten la estimación de ese
// concepto (por nivel).

// Verbos que no se pueden observar: describen un estado, no algo que se hace.
const NOT_OBSERVABLE = new Set([
  'entender',
  'saber',
  'conocer',
  'comprender',
  'aprender',
  'manejar',
  'familiarizarse',
  'tener',
  'ser',
  'estar',
]);

const ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo']);

const lowered = (text: string) =>
  normalizeShortAnswer(text.replace(/\s+/gu, '_')).replace(/_/gu, ' ');

export function conceptKeyOf(content: string): string {
  const words = lowered(content)
    .split(' ')
    .filter((word) => word !== '');
  if (words.length > 1 && ARTICLES.has(words[0] as string)) {
    words.shift();
  }
  return words.join(' ');
}

// El concepto como se lee en pantalla: el contenido sin el artículo del principio, con sus tildes.
export function conceptNameOf(content: string): string {
  const words = content.trim().split(/\s+/u);
  if (words.length > 1 && ARTICLES.has(lowered(words[0] as string))) {
    words.shift();
  }
  return words.join(' ');
}

export function parseObjectiveText(text: string): {
  title: string;
  action: string;
  content: string;
  conceptKey: string;
  observable: boolean;
} {
  const title = text.trim().replace(/\s+/gu, ' ');
  const space = title.indexOf(' ');
  const action = space === -1 ? title : title.slice(0, space);
  const content = space === -1 ? '' : title.slice(space + 1);
  const verb = lowered(action);
  const infinitive = /(ar|er|ir|arse|erse|irse)$/u.test(verb);
  return {
    title,
    action,
    content,
    conceptKey: conceptKeyOf(content === '' ? title : content),
    observable: infinitive && !NOT_OBSERVABLE.has(verb),
  };
}
