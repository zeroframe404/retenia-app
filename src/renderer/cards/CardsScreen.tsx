import { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { CardForm } from './CardForm';
import styles from './Cards.module.css';
import { ReviewView } from './ReviewView';

type View = { kind: 'list' } | { kind: 'form' } | { kind: 'review'; card: Card };

// La pantalla provisoria «Tarjetas»: la lista, el formulario de alta y el repaso mínimo. El
// diseño fino llega en la Fase 06.
export function CardsScreen() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');

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

  if (view.kind === 'review') {
    return (
      <ReviewView
        card={view.card}
        onReviewed={replaceCard}
        onClose={() => {
          setNotice('');
          setView({ kind: 'list' });
        }}
      />
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
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setView({ kind: 'review', card })}
              >
                {texts.cards.review}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
