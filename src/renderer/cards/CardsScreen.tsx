import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, CardDetail } from '../../preload/contract/cards';
import type { Subject } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import { CardDetailView } from './CardDetail';
import { CardForm } from './CardForm';
import { CardFilters, CardList, type Filters, NO_FILTERS } from './CardList';
import styles from './Cards.module.css';
import { HistoryView } from './HistoryView';
import { ReviewView } from './ReviewView';
import { SheetForm } from './SheetForm';

type View =
  | { kind: 'list' }
  | { kind: 'form' }
  | { kind: 'detail'; cardId: string; version: number }
  | { kind: 'edit'; card: CardDetail }
  | { kind: 'review'; card: Card }
  | { kind: 'history'; card: Card };

type Topic = { id: string; name: string };

// Apuntes › «Tarjetas»: todas las tarjetas de la materia que se mira, con su contador y sus filtros
// por tema, estado y tipo; el detalle de cada una (camino de contexto, ficha, «Editar ficha»,
// «Crear inversa», «Pausar esta tarjeta», «Historial», «Ver en la nota» y «Eliminar») y «Nueva
// tarjeta» suelta. Sin materia (las pruebas de la Fase 03) muestra todas.
export function CardsScreen({
  subject,
  onOpenNote,
  cardRequest = null,
}: {
  subject?: Subject | undefined;
  onOpenNote?: ((noteId: string, blockId: string) => void) | undefined;
  // Una tarjeta para abrir de entrada («Abrir la tarjeta» en Progreso); cada pedido es distinto.
  cardRequest?: { cardId: string; nonce: number } | null;
}) {
  const subjectId = subject?.id;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');
  // Una lectura vieja que llega tarde no pisa a una más nueva.
  const requests = useRef(0);
  // Cada vez que se abre el detalle se lo vuelve a leer: este número lo avisa.
  const versions = useRef(0);
  const nextVersion = () => {
    versions.current += 1;
    return versions.current;
  };

  const load = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    setLoadFailed(false);
    try {
      const response = await window.retenia['cards.list']({
        ...(subjectId === undefined ? {} : { subjectId }),
        ...(filters.topicId === '' ? {} : { topicId: filters.topicId }),
        ...(filters.sheetState === ''
          ? {}
          : { sheetState: filters.sheetState as Card['sheetState'] }),
        ...(filters.kind === '' ? {} : { kind: filters.kind as Card['kind'] }),
      });
      if (requests.current === mine) {
        setCards(response.cards);
        setTotal(response.total);
      }
    } catch {
      if (requests.current === mine) {
        setLoadFailed(true);
      }
    }
  }, [subjectId, filters]);

  // Al pasar a otra materia no queda nada de la anterior: ni el filtro de tema ni una tarjeta abierta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando cambia la materia.
  useEffect(() => {
    setFilters(NO_FILTERS);
    setView({ kind: 'list' });
    setNotice('');
    setTopics([]);
  }, [subjectId]);

  // «Abrir la tarjeta» desde otra pantalla: después de lo de arriba (si también cambió la materia).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando llega un pedido nuevo.
  useEffect(() => {
    if (cardRequest) {
      setView({ kind: 'detail', cardId: cardRequest.cardId, version: nextVersion() });
    }
  }, [cardRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (subjectId === undefined) {
      return;
    }
    let current = true;
    window.retenia['topics.list']({ subjectId }).then(
      ({ topics: loaded }) => {
        if (current) {
          setTopics(loaded.map((topic) => ({ id: topic.id, name: topic.name })));
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [subjectId]);

  const backToList = () => {
    setView({ kind: 'list' });
    void load();
  };

  if (view.kind === 'review') {
    return <ReviewView card={view.card} onReviewed={() => undefined} onClose={backToList} />;
  }

  if (view.kind === 'history') {
    return <HistoryView card={view.card} onClose={backToList} />;
  }

  if (view.kind === 'edit') {
    const { card } = view;
    return (
      <ScreenFrame level={3} title={texts.cards.sheetTitle}>
        <SheetForm
          card={card}
          onCancel={() => setView({ kind: 'detail', cardId: card.id, version: nextVersion() })}
          onSaved={() => {
            setNotice(texts.cards.edited);
            setView({ kind: 'detail', cardId: card.id, version: nextVersion() });
          }}
        />
      </ScreenFrame>
    );
  }

  if (view.kind === 'detail') {
    return (
      <ScreenFrame level={3} title={texts.cards.detailTitle}>
        <Toast>{notice}</Toast>
        <CardDetailView
          cardId={view.cardId}
          version={view.version}
          onBack={() => {
            setNotice('');
            backToList();
          }}
          onEdit={(card) => {
            setNotice('');
            setView({ kind: 'edit', card });
          }}
          onReview={(card) => setView({ kind: 'review', card })}
          onHistory={(card) => setView({ kind: 'history', card })}
          onOpenNote={onOpenNote}
          onChanged={() => void load()}
          onRemoved={backToList}
          onNotice={setNotice}
        />
      </ScreenFrame>
    );
  }

  // El botón principal queda siempre arriba, junto al título: el estado vacío lo nombra («Tocá
  // «Nueva tarjeta»…») y no lo repite.
  const filtering = filters.topicId !== '' || filters.sheetState !== '' || filters.kind !== '';
  const showEmpty = cards !== null && cards.length === 0 && view.kind === 'list' && !loadFailed;
  return (
    <ScreenFrame
      level={3}
      title={texts.cards.title}
      actions={
        view.kind === 'list' ? (
          <Boton
            variant="primary"
            onClick={() => {
              setNotice('');
              setView({ kind: 'form' });
            }}
          >
            {texts.cards.newCard}
          </Boton>
        ) : null
      }
    >
      <Toast>{notice}</Toast>
      {view.kind === 'form' ? (
        <CardForm
          subjectId={subjectId}
          topics={topics}
          onCancel={() => setView({ kind: 'list' })}
          onSaved={() => {
            setNotice(texts.cards.saved);
            setView({ kind: 'list' });
            void load();
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
      {cards !== null && !loadFailed && (total > 0 || filtering) ? (
        <>
          <p className={styles.counter} aria-live="polite">
            {texts.cards.counter(cards.length, total)}
          </p>
          <CardFilters filters={filters} topics={topics} onChange={setFilters} />
        </>
      ) : null}
      {showEmpty && total === 0 ? <ViewState kind="empty" phrase={texts.cards.empty} /> : null}
      {showEmpty && total > 0 ? (
        <ViewState kind="empty" phrase={texts.cards.emptyFiltered} />
      ) : null}
      {cards !== null && cards.length > 0 ? (
        <CardList
          cards={cards}
          onOpen={(card) => {
            setNotice('');
            setView({ kind: 'detail', cardId: card.id, version: nextVersion() });
          }}
          onReview={(card) => setView({ kind: 'review', card })}
        />
      ) : null}
    </ScreenFrame>
  );
}
