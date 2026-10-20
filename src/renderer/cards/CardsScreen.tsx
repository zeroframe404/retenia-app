import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import { CardForm } from './CardForm';
import { HistoryView } from './HistoryView';
import { ReviewView } from './ReviewView';

type View =
  | { kind: 'list' }
  | { kind: 'form' }
  | { kind: 'review'; card: Card }
  | { kind: 'history'; card: Card }
  | { kind: 'edit'; card: Card };

// La pantalla provisoria «Tarjetas» (adentro de Apuntes): la lista, el alta, el repaso mínimo, el
// historial, editar y eliminar.
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

  const openForm = () => {
    setNotice('');
    setView({ kind: 'form' });
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
      <ScreenFrame level={3} title={texts.cards.editTitle}>
        <CardForm
          card={view.card}
          onCancel={backToList}
          onSaved={(updated) => {
            replaceCard(updated);
            setNotice(texts.cards.edited);
            setView({ kind: 'list' });
          }}
        />
      </ScreenFrame>
    );
  }

  // El botón principal queda siempre arriba, junto al título: el estado vacío lo nombra («Tocá
  // «Nueva tarjeta»…») y no lo repite.
  const showEmpty = cards !== null && cards.length === 0 && view.kind === 'list' && !loadFailed;
  return (
    <ScreenFrame
      level={3}
      title={texts.cards.title}
      actions={
        view.kind === 'list' ? (
          <Boton variant="primary" onClick={openForm}>
            {texts.cards.newCard}
          </Boton>
        ) : null
      }
    >
      <Toast>{notice}</Toast>
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
        <ViewState
          kind="error"
          phrase={texts.cards.loadFailed}
          action={{ text: texts.cards.retry, onClick: () => void load() }}
        />
      ) : null}
      {showEmpty ? <ViewState kind="empty" phrase={texts.cards.empty} /> : null}
      {cards !== null && cards.length > 0 ? (
        <ItemList label={texts.cards.listLabel}>
          {cards.map((card) => (
            <ListItem
              key={card.id}
              title={card.question}
              detail={
                card.nextReviewDay
                  ? texts.cards.nextReview(formatLongDate(card.nextReviewDay))
                  : texts.cards.notReviewed
              }
              actions={
                <>
                  <Boton onClick={() => setView({ kind: 'review', card })}>
                    {texts.cards.review}
                  </Boton>
                  <Boton onClick={() => setView({ kind: 'history', card })}>
                    {texts.cards.history}
                  </Boton>
                  <Boton
                    onClick={() => {
                      setNotice('');
                      setView({ kind: 'edit', card });
                    }}
                  >
                    {texts.cards.edit}
                  </Boton>
                  <Boton onClick={() => void remove(card)}>{texts.cards.remove}</Boton>
                </>
              }
            />
          ))}
        </ItemList>
      ) : null}
    </ScreenFrame>
  );
}
