import { useEffect, useState } from 'react';
import type { Card, CardHistory } from '../../preload/contract/cards';
import { formatLongDate, formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

type Entry = CardHistory['entries'][number];

// Un aplazamiento (Fase 11) no tiene resultado de calificación: dice hasta cuándo se aplazó.
const RESULTS: Record<Exclude<Entry['result'], 'postponed'>, string> = {
  good: texts.cards.gradeGood,
  hard: texts.cards.gradeHard,
  again: texts.cards.gradeAgain,
  adopted: texts.history.adopted,
  reset: texts.history.reset,
};

// El renglón de un repaso: la fecha, el resultado y, desde la Fase 09, «Anulado» si se deshizo o por
// qué no cambió la fecha (otro repaso del mismo día, o uno con fecha anterior al último que contó).
// El de un aplazamiento es un renglón más: la fecha y «Aplazada hasta el…», sin marcas.
function rowText(entry: Entry): string {
  if (entry.result === 'postponed') {
    return texts.history.row(
      formatShortDate(entry.day),
      entry.plannedDay === null
        ? texts.history.postponedNoDay
        : texts.history.postponed(entry.plannedDay),
    );
  }
  // Fase 15: un repaso que vino de Anki lo dice.
  const base = texts.history.row(formatShortDate(entry.day), RESULTS[entry.result]);
  const row =
    entry.origin === 'anki' ? texts.history.marked(base, texts.imports.fromAnkiOrigin) : base;
  if (entry.annulled) {
    return texts.history.marked(row, texts.history.annulled);
  }
  if (entry.skipped === 'sameDay') {
    return texts.history.marked(row, texts.history.sameDay);
  }
  return entry.skipped === 'earlier' ? texts.history.marked(row, texts.history.earlier) : row;
}

// «Historial» de una tarjeta: un renglón por repaso, con la fecha y el resultado, en el orden en
// que se hicieron. Solo se agrega: un renglón nunca cambia; uno deshecho dice «Anulado».
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
        {card.nextReviewDay ? (
          <p className={styles.block}>
            {texts.cards.nextReview(formatLongDate(card.nextReviewDay))}
          </p>
        ) : null}
        {failed ? <ViewState kind="error" phrase={texts.history.loadFailed} /> : null}
        {history !== null && history.entries.length === 0 ? (
          <ViewState kind="empty" phrase={texts.history.empty} />
        ) : null}
        {history !== null && history.entries.length > 0 ? (
          <ItemList ordered label={texts.history.listLabel}>
            {history.entries.map((entry) => (
              <ListItem key={entry.id} text={rowText(entry)} />
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
