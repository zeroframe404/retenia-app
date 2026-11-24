import { useEffect, useState } from 'react';
import type { Card, CardHistory } from '../../preload/contract/cards';
import { formatLongDate, formatShortDate, texts } from '../../preload/contract/texts';
import practiceStyles from '../practice/Practice.module.css';
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
  if (entry.evaluation) {
    return attemptText(entry, entry.evaluation);
  }
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
  if (entry.affected) {
    return texts.history.marked(row, texts.history.notCounted);
  }
  return entry.skipped === 'earlier' ? texts.history.marked(row, texts.history.earlier) : row;
}

const VERDICTS = texts.practice.verdicts;

// Fase 16: un intento sobre un ejercicio, con su calificación vigente (o «Sin evaluar») y por qué
// no movió la fecha, si no la movió.
function attemptText(entry: Entry, evaluation: NonNullable<Entry['evaluation']>): string {
  const date = formatShortDate(entry.day);
  if (evaluation.current === null) {
    return texts.history.row(date, texts.history.unevaluated);
  }
  const row = texts.history.row(date, VERDICTS[evaluation.current]);
  if (entry.affected) {
    return texts.history.marked(row, texts.history.notCounted);
  }
  if (entry.skipped === 'sameDay') {
    return texts.history.marked(row, texts.history.sameDay);
  }
  if (entry.skipped === 'earlier') {
    return texts.history.marked(row, texts.history.earlier);
  }
  return entry.counted ? row : texts.history.marked(row, texts.history.retried);
}

// Las calificaciones anteriores de un intento corregido, tachadas: el historial nunca borra una.
function EarlierGrades({ evaluation }: { evaluation: NonNullable<Entry['evaluation']> }) {
  // Las anteriores distintas de la vigente (una corrección deshecha vuelve a la de antes: esa no se
  // repite tachada).
  const earlier = [
    ...new Set(
      evaluation.versions.slice(0, -1).filter((verdict) => verdict !== evaluation.current),
    ),
  ];
  if (earlier.length === 0) {
    return null;
  }
  const undone = evaluation.causes.at(-1) === 'undo';
  return (
    <p className={practiceStyles.earlier}>
      {texts.history.earlierGrades}{' '}
      {earlier.map((verdict, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: las versiones se repiten; vale su orden.
        <del key={index}>{VERDICTS[verdict]} </del>
      ))}
      {undone ? texts.history.undone : null}
    </p>
  );
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
              <ListItem key={entry.id} text={rowText(entry)}>
                {entry.evaluation ? <EarlierGrades evaluation={entry.evaluation} /> : null}
              </ListItem>
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
