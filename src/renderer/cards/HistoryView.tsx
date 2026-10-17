import { useEffect, useState } from 'react';
import type { Card, CardHistory } from '../../preload/contract/cards';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

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
    <ScreenFrame level={3} title={texts.history.title}>
      <div className={styles.stack}>
        <p className={styles.block}>{history?.question ?? card.question}</p>
        {failed ? <ViewState kind="error" phrase={texts.history.loadFailed} /> : null}
        {history !== null && history.entries.length === 0 ? (
          <ViewState kind="empty" phrase={texts.history.empty} />
        ) : null}
        {history !== null && history.entries.length > 0 ? (
          <ItemList ordered label={texts.history.listLabel}>
            {history.entries.map((entry) => (
              <ListItem
                key={entry.id}
                text={texts.history.row(formatShortDate(entry.day), RESULTS[entry.result])}
              />
            ))}
          </ItemList>
        ) : null}
        <div className={styles.actions}>
          <Boton variant="primary" onClick={onClose}>
            {texts.cards.backToCards}
          </Boton>
        </div>
      </div>
    </ScreenFrame>
  );
}
