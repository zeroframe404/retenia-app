import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivationCost, Card, CardDetail } from '../../preload/contract/cards';
import type { Subject } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog, ScreenFrame, Toast } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { CardDetailView } from './CardDetail';
import { CardForm } from './CardForm';
import { CardFilters, CardList, type Filters, isNewCard, NO_FILTERS } from './CardList';
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

// Cuántas tarjetas nuevas se suman de una vez: el tope del contrato de «Sumar a mis repasos».
const MAX_CHOSEN = 500;

// Lo que se confirma en «Sumar a mis repasos»: las tarjetas elegidas, cuánto suman y el
// identificador del lote (el mismo si se reintenta: no se suma dos veces).
interface Activation {
  batchId: string;
  cardIds: string[];
  cost: ActivationCost;
}

// Apuntes › «Tarjetas»: todas las tarjetas de la materia que se mira, con su contador y sus filtros
// por tema, estado y tipo; el detalle de cada una (camino de contexto, ficha, «Editar ficha»,
// «Crear inversa», «Pausar esta tarjeta», «Historial», «Ver en la nota» y «Eliminar») y «Nueva
// tarjeta» suelta. Sin materia (las pruebas de la Fase 03) muestra todas. Las tarjetas nuevas se pueden
// elegir y sumar a los repasos («Sumar a mis repasos»), con el costo a la vista antes de confirmar.
export function CardsScreen({
  subject,
  onOpenNote,
  onOpenOriginal,
  cardRequest = null,
}: {
  subject?: Subject | undefined;
  onOpenNote?: ((noteId: string, blockId: string) => void) | undefined;
  onOpenOriginal?: ((materialId: string, cardId: string) => void) | undefined;
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
  const [problem, setProblem] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [activation, setActivation] = useState<Activation | null>(null);
  const activating = useRef(false);
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
    setProblem('');
    setChosen(new Set());
    setTopics([]);
  }, [subjectId]);

  // Si una tarjeta elegida ya no se ve en la lista (otro filtro) o dejó de ser nueva, se la suelta.
  useEffect(() => {
    if (cards === null) {
      return;
    }
    const available = new Set(cards.filter(isNewCard).map((card) => card.id));
    setChosen((current) => {
      const kept = new Set([...current].filter((id) => available.has(id)));
      return kept.size === current.size ? current : kept;
    });
  }, [cards]);

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

  const toggle = (card: Card) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(card.id) && next.size < MAX_CHOSEN) {
        next.add(card.id);
      }
      return next;
    });

  // «Sumar a mis repasos»: primero se dice cuánto suman las elegidas; recién se suman al confirmar.
  async function askActivationCost() {
    setNotice('');
    setProblem('');
    const cardIds = [...chosen];
    try {
      const cost = await window.retenia['cards.activationCost']({ count: cardIds.length });
      setActivation({ batchId: crypto.randomUUID(), cardIds, cost });
    } catch {
      setProblem(texts.cards.activateCostFailed);
    }
  }

  async function confirmActivation(current: Activation) {
    if (activating.current) {
      return;
    }
    activating.current = true;
    try {
      const { activated } = await window.retenia['cards.activate']({
        batchId: current.batchId,
        cardIds: current.cardIds,
      });
      setActivation(null);
      setChosen(new Set());
      setNotice(texts.cards.activated(activated));
      void load();
    } catch {
      setActivation(null);
      setProblem(texts.cards.activateFailed);
    } finally {
      activating.current = false;
    }
  }

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
          onOpenOriginal={onOpenOriginal}
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
      {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
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
          {cards.some(isNewCard) ? (
            <div className={styles.selectionBar}>
              <Boton disabled={chosen.size === 0} onClick={() => void askActivationCost()}>
                {texts.cards.activate}
              </Boton>
              <p className={styles.chosen} aria-live="polite">
                {texts.cards.activateChosen(chosen.size)}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      {showEmpty && total === 0 ? <ViewState kind="empty" phrase={texts.cards.empty} /> : null}
      {showEmpty && total > 0 ? (
        <ViewState kind="empty" phrase={texts.cards.emptyFiltered} />
      ) : null}
      {cards !== null && cards.length > 0 ? (
        <CardList
          cards={cards}
          choice={{ chosen, full: chosen.size >= MAX_CHOSEN, onToggle: toggle }}
          onOpen={(card) => {
            setNotice('');
            setView({ kind: 'detail', cardId: card.id, version: nextVersion() });
          }}
          onReview={(card) => setView({ kind: 'review', card })}
        />
      ) : null}
      {activation === null ? null : (
        <Dialog title={texts.cards.activate} onClose={() => setActivation(null)}>
          <p>
            {texts.cards.activateCost(
              activation.cardIds.length,
              activation.cost.lowMinutes,
              activation.cost.highMinutes,
            )}
          </p>
          <div className={styles.dialogActions}>
            <Boton variant="primary" onClick={() => void confirmActivation(activation)}>
              {texts.cards.activateConfirm}
            </Boton>
            <Boton onClick={() => setActivation(null)}>{texts.cards.cancel}</Boton>
          </div>
        </Dialog>
      )}
    </ScreenFrame>
  );
}
