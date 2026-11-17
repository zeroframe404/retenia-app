import type { CardDetail } from '../../preload/contract/cards';
import { texts } from '../../preload/contract/texts';
import styles from './Cards.module.css';

// El camino de contexto de la tarjeta: «Estadística básica › Regresión › Regresión lineal». Una
// nota sin tema pasa por «Sin tema»; una nota sin título, por «Sin título». Lo usan la pantalla de
// una tarjeta y la sesión de estudio.
function pathText(card: CardDetail): string {
  const { subjectName, topicName, noteTitle } = card.path;
  const topic = topicName ?? (noteTitle === null ? null : texts.cards.noTopic);
  const note = noteTitle === null ? null : noteTitle === '' ? texts.notes.list.untitled : noteTitle;
  const parts = [subjectName, topic, note].filter((part): part is string => part !== null);
  return parts.length === 0 ? texts.cards.noPath : parts.join(texts.cards.pathSeparator);
}

export function CardPath({ card }: { card: CardDetail }) {
  return (
    <nav aria-label={texts.cards.pathLabel}>
      <p className={styles.path}>{pathText(card)}</p>
    </nav>
  );
}
