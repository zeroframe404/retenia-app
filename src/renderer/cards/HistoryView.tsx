import { useEffect, useState } from 'react';
import type { Card, CardHistory } from '../../preload/contract/cards';
import { formatShortDate, texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';

const RESULTS: Record<CardHistory['entries'][number]['result'], string> = {
  good: texts.cards.gradeGood,
  hard: texts.cards.gradeHard,
  again: texts.cards.gradeAgain,
  adopted: texts.history.adopted,
};

// «Historial» de una tarjeta: un renglón por repaso, con la fecha y el resultado, en el orden en
// que se hicieron. Solo se agrega: un renglón nunca cambia.
export function HistoryView({ card, onClose }: { card: Card; onClose: () => void }) {
  const [history, setHistory] = useState<CardHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    window.retenia['cards.history']({ cardId: card.id })
      .then((loaded) => {
        if (active) {
          setHistory(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [card.id]);

  return (
    <section className={`${styles.screen} ${styles.stack}`} aria-labelledby="titulo-historial">
      <div className={styles.header}>
        <h2 id="titulo-historial">{texts.history.title}</h2>
      </div>
      <p className={styles.reviewText}>{history?.question ?? card.question}</p>
      {failed ? <p className={styles.loadFailed}>{texts.history.loadFailed}</p> : null}
      {history !== null && history.entries.length === 0 ? (
        <p className={styles.empty}>{texts.history.empty}</p>
      ) : null}
      {history !== null && history.entries.length > 0 ? (
        <ol className={styles.list} aria-label={texts.history.listLabel}>
          {history.entries.map((entry) => (
            <li key={entry.id} className={styles.item}>
              {texts.history.row(formatShortDate(entry.day), RESULTS[entry.result])}
            </li>
          ))}
        </ol>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onClose}>
          {texts.cards.backToCards}
        </button>
      </div>
    </section>
  );
}
