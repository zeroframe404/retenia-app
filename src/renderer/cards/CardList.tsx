import { useLayoutEffect, useRef, useState } from 'react';
import { type Card, SHEET_STATE_VALUES } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from './Cards.module.css';
import { visibleWindow } from './windowing';

// Cada fila tiene un alto fijo: así se sabe cuáles se ven sin medir las demás.
const ROW_HEIGHT = 76;
const OVERSCAN = 6;
const DEFAULT_VIEWPORT = 640;

export interface Filters {
  topicId: string;
  sheetState: string;
  kind: string;
}

export const NO_FILTERS: Filters = { topicId: '', sheetState: '', kind: '' };

// Los tres filtros de la lista: tema, estado y tipo.
export function CardFilters({
  filters,
  topics,
  onChange,
}: {
  filters: Filters;
  topics: readonly { id: string; name: string }[];
  onChange: (filters: Filters) => void;
}) {
  return (
    <fieldset className={styles.filters}>
      <legend className="visually-hidden">{texts.cards.filtersLabel}</legend>
      <label className={styles.filter}>
        {texts.cards.filterTopic}
        <select
          value={filters.topicId}
          onChange={(event) => onChange({ ...filters, topicId: event.target.value })}
        >
          <option value="">{texts.cards.allTopics}</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
          <option value="none">{texts.cards.noTopic}</option>
        </select>
      </label>
      <label className={styles.filter}>
        {texts.cards.filterState}
        <select
          value={filters.sheetState}
          onChange={(event) => onChange({ ...filters, sheetState: event.target.value })}
        >
          <option value="">{texts.cards.allStates}</option>
          {SHEET_STATE_VALUES.map((state) => (
            <option key={state} value={state}>
              {texts.cards.sheetStates[state]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filter}>
        {texts.cards.filterKind}
        <select
          value={filters.kind}
          onChange={(event) => onChange({ ...filters, kind: event.target.value })}
        >
          <option value="">{texts.cards.allKinds}</option>
          <option value="qa">{texts.cards.kindQa}</option>
          <option value="cloze">{texts.cards.kindCloze}</option>
        </select>
      </label>
    </fieldset>
  );
}

// El renglón de la tarjeta: su pregunta, su próximo repaso (o «En pausa») y su tipo y estado.
function Row({
  card,
  index,
  count,
  onOpen,
  onReview,
}: {
  card: Card;
  index: number;
  count: number;
  onOpen: (card: Card) => void;
  onReview: (card: Card) => void;
}) {
  // Una sola línea (se corta con puntos suspensivos y se lee entera apoyando el mouse): cuándo
  // vuelve a aparecer, de qué tipo es, en qué estado está y de qué tema.
  const when = card.paused
    ? texts.cards.paused
    : card.nextReviewDay
      ? texts.cards.nextReview(formatLongDate(card.nextReviewDay))
      : texts.cards.notReviewed;
  const meta = [
    when,
    card.kind === 'cloze' ? texts.cards.kindCloze : texts.cards.kindQa,
    texts.cards.sheetStates[card.sheetState],
    card.topicName,
  ]
    .filter((part): part is string => part !== null)
    .join(texts.cards.metaSeparator);
  return (
    <li
      className={styles.row}
      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
      aria-posinset={index + 1}
      aria-setsize={count}
    >
      <div className={styles.rowLine}>
        <p className={styles.rowTitle}>
          <button
            type="button"
            className={styles.open}
            title={card.question}
            aria-label={texts.cards.open(card.question)}
            onClick={() => onOpen(card)}
          >
            {card.question}
          </button>
        </p>
        <Boton variant="quiet" onClick={() => onReview(card)}>
          {texts.cards.review}
        </Boton>
      </div>
      <p className={styles.rowMeta} title={meta}>
        {meta}
      </p>
    </li>
  );
}

// La lista de tarjetas: solo arma las filas que se ven (más un margen), así soporta miles sin
// trabarse. Cada fila anuncia su lugar en el total para el lector de pantalla.
export function CardList({
  cards,
  onOpen,
  onReview,
}: {
  cards: readonly Card[];
  onOpen: (card: Card) => void;
  onReview: (card: Card) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const measure = () => setViewportHeight(element.clientHeight || DEFAULT_VIEWPORT);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Al cambiar los filtros la lista vuelve al principio.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando cambia cuántas hay.
  useLayoutEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [cards.length]);

  const slice = visibleWindow({
    count: cards.length,
    rowHeight: ROW_HEIGHT,
    viewportHeight,
    scrollTop,
    overscan: OVERSCAN,
  });
  return (
    <section
      ref={scroller}
      className={styles.scroller}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: la zona con barra de desplazamiento se alcanza con el teclado.
      tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <ul
        className={styles.rows}
        style={{ height: slice.totalHeight }}
        aria-label={texts.cards.listLabel}
      >
        {cards.slice(slice.start, slice.end).map((card, offset) => (
          <Row
            key={card.id}
            card={card}
            index={slice.start + offset}
            count={cards.length}
            onOpen={onOpen}
            onReview={onReview}
          />
        ))}
      </ul>
    </section>
  );
}
