import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';
import { CardForm } from './CardForm';
import { HistoryView } from './HistoryView';
import { ReviewView } from './ReviewView';

type View =
  | { kind: 'list' }
  | { kind: 'form' }
  | { kind: 'review'; card: Card }
  | { kind: 'history'; card: Card }
  | { kind: 'edit'; card: Card };

// La pantalla provisoria «Tarjetas»: la lista, el alta, el repaso mínimo, el historial, editar y
// eliminar. El diseño fino llega en la Fase 06.
export function CardsScreen() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');
  const removing = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setCards((await window.retenia['cards.list']({})).cards);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceCard = (updated: Card) =>
    setCards((current) => current?.map((c) => (c.id === updated.id ? updated : c)) ?? null);

  const backToList = () => {
    setNotice('');
    setView({ kind: 'list' });
  };

  // «Eliminar»: a la Papelera. Un candado evita que un doble toque la elimine dos veces.
  async function remove(card: Card) {
    if (removing.current) {
      return;
    }
    removing.current = true;
    setNotice('');
    try {
      await window.retenia['cards.delete']({ cardId: card.id });
      setCards((current) => current?.filter((c) => c.id !== card.id) ?? null);
      setNotice(texts.cards.removed);
    } catch {
      setNotice(texts.cards.removeFailed);
    } finally {
      removing.current = false;
    }
  }

  if (view.kind === 'review') {
    return <ReviewView card={view.card} onReviewed={replaceCard} onClose={backToList} />;
  }

  if (view.kind === 'history') {
    return <HistoryView card={view.card} onClose={backToList} />;
  }

  if (view.kind === 'edit') {
    return (
      <section className={styles.screen} aria-labelledby="titulo-editar">
        <div className={styles.header}>
          <h2 id="titulo-editar">{texts.cards.editTitle}</h2>
        </div>
        <CardForm
          card={view.card}
          onCancel={backToList}
          onSaved={(updated) => {
            replaceCard(updated);
            setNotice(texts.cards.edited);
            setView({ kind: 'list' });
          }}
        />
      </section>
    );
  }

  return (
    <section className={styles.screen} aria-labelledby="titulo-tarjetas">
      <div className={styles.header}>
        <h2 id="titulo-tarjetas">{texts.cards.title}</h2>
        {view.kind === 'list' ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setNotice('');
              setView({ kind: 'form' });
            }}
          >
            {texts.cards.newCard}
          </button>
        ) : null}
      </div>
      <div role="status" className={styles.notice}>
        {notice}
      </div>
      {view.kind === 'form' ? (
        <CardForm
          onCancel={() => setView({ kind: 'list' })}
          onSaved={(card) => {
            setCards((current) => [card, ...(current ?? [])]);
            setNotice(texts.cards.saved);
            setView({ kind: 'list' });
          }}
        />
      ) : null}
      {loadFailed ? (
        <div className={styles.loadFailed}>
          <p>{texts.cards.loadFailed}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>
            {texts.cards.retry}
          </button>
        </div>
      ) : null}
      {cards !== null && cards.length === 0 && view.kind === 'list' ? (
        <p className={styles.empty}>{texts.cards.empty}</p>
      ) : null}
      {cards !== null && cards.length > 0 ? (
        <ul className={styles.list} aria-label={texts.cards.listLabel}>
          {cards.map((card) => (
            <li key={card.id} className={styles.item}>
              <div className={styles.itemText}>
                <p className={styles.question}>{card.question}</p>
                <p className={styles.meta}>
                  {card.nextReviewDay
                    ? texts.cards.nextReview(formatLongDate(card.nextReviewDay))
                    : texts.cards.notReviewed}
                </p>
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setView({ kind: 'review', card })}
                >
                  {texts.cards.review}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setView({ kind: 'history', card })}
                >
                  {texts.cards.history}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setNotice('');
                    setView({ kind: 'edit', card });
                  }}
                >
                  {texts.cards.edit}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => void remove(card)}
                >
                  {texts.cards.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
