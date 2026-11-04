import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardDetail } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import contentStyles from '../ui/Content.module.css';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { CardFace } from './CardFace';
import styles from './Cards.module.css';

// El camino de contexto de la tarjeta: «Estadística básica › Regresión › Regresión lineal».
function pathText(card: CardDetail): string {
  const parts = [card.path.subjectName, card.path.topicName, card.path.noteTitle].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? texts.cards.noPath : parts.join(texts.cards.pathSeparator);
}

// El detalle de una tarjeta: dónde nació, su pregunta y respuesta, su ficha y sus acciones («Editar
// ficha», «Crear inversa», «Pausar esta tarjeta» o «Reanudar», «Historial», «Ver en la nota»,
// «Repasar» y «Eliminar»).
export function CardDetailView({
  cardId,
  version,
  onBack,
  onEdit,
  onReview,
  onHistory,
  onOpenNote,
  onChanged,
  onRemoved,
  onNotice,
}: {
  cardId: string;
  // Cambia cada vez que hay que volver a leer la tarjeta (después de editarla).
  version: number;
  onBack: () => void;
  onEdit: (card: CardDetail) => void;
  onReview: (card: CardDetail) => void;
  onHistory: (card: CardDetail) => void;
  onOpenNote?: ((noteId: string, blockId: string) => void) | undefined;
  // Algo cambió (pausa, inversa): la lista de atrás se vuelve a leer.
  onChanged: () => void;
  onRemoved: () => void;
  onNotice: (text: string) => void;
}) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState('');
  const working = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setCard(await window.retenia['cards.get']({ cardId }));
    } catch {
      setFailed(true);
    }
  }, [cardId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` solo sirve para volver a leer.
  useEffect(() => {
    void load();
  }, [load, version]);

  // Un candado evita que un doble toque haga la misma acción dos veces.
  async function act(task: () => Promise<void>, failure: string) {
    if (working.current) {
      return;
    }
    working.current = true;
    setProblem('');
    try {
      await task();
    } catch {
      setProblem(failure);
    } finally {
      working.current = false;
    }
  }

  if (failed) {
    return (
      <ViewState
        kind="error"
        phrase={texts.cards.loadFailed}
        action={{ text: texts.cards.retry, onClick: () => void load() }}
      />
    );
  }
  if (card === null) {
    return null;
  }

  const togglePause = () =>
    act(async () => {
      await window.retenia['cards.setPaused']({ cardId: card.id, paused: !card.paused });
      onNotice(card.paused ? texts.cards.resumedNotice : texts.cards.pausedNotice);
      onChanged();
      await load();
    }, texts.cards.pauseFailed);

  const createInverse = () =>
    act(async () => {
      const { created } = await window.retenia['cards.createInverse']({ cardId: card.id });
      onNotice(created ? texts.cards.inverseCreated : texts.cards.inverseExists);
      onChanged();
      await load();
    }, texts.cards.inverseFailed);

  const remove = () =>
    act(async () => {
      await window.retenia['cards.delete']({ cardId: card.id });
      onNotice(texts.cards.removed);
      onRemoved();
    }, texts.cards.removeFailed);

  const { sheet, path } = card;
  const next = card.paused
    ? texts.cards.paused
    : card.nextReviewDay
      ? texts.cards.nextReview(formatLongDate(card.nextReviewDay))
      : texts.cards.notReviewed;
  const noteId = path.noteId;
  const blockId = path.blockId;

  return (
    <div className={contentStyles.stack}>
      <nav aria-label={texts.cards.pathLabel}>
        <p className={styles.path}>{pathText(card)}</p>
      </nav>
      <div className={styles.facePanel}>
        <h4>{texts.cards.questionHeading}</h4>
        <CardFace content={card.questionContent} />
        <h4>{texts.cards.answerHeading}</h4>
        <CardFace content={card.answerContent} />
      </div>
      <p className={contentStyles.highlight}>{next}</p>
      <section className={contentStyles.section} aria-label={texts.cards.sheetHeading}>
        <h4>{texts.cards.sheetHeading}</h4>
        <ul className={styles.sheetList}>
          <li>{texts.cards.stateLine(texts.cards.sheetStates[sheet.state])}</li>
          <li>{texts.cards.formLine(texts.cards.formTypes[sheet.formType])}</li>
          {sheet.referenceAnswer === '' ? null : (
            <li>{texts.cards.referenceLine(sheet.referenceAnswer)}</li>
          )}
          {sheet.variants.length === 0 ? null : (
            <li>{texts.cards.variantsLine(sheet.variants.join('; '))}</li>
          )}
          {sheet.essentials.length === 0 ? null : (
            <li>{texts.cards.essentialsLine(sheet.essentials.join('; '))}</li>
          )}
          {sheet.hints.map((hint, index) => (
            <li key={hint}>{texts.cards.hintLine(index + 1, hint)}</li>
          ))}
          {sheet.explanation === '' ? null : (
            <li>{texts.cards.explanationLine(sheet.explanation)}</li>
          )}
          {sheet.source === '' ? null : <li>{texts.cards.sourceLine(sheet.source)}</li>}
        </ul>
      </section>
      {card.siblingGroupId === null ? null : (
        <p className={styles.fieldHelp}>{texts.cards.siblingsNotice}</p>
      )}
      {card.detached ? <p>{texts.cards.detachedNotice}</p> : null}
      {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
      <div className={contentStyles.actions}>
        <Boton variant="primary" onClick={() => onEdit(card)}>
          {texts.cards.editSheet}
        </Boton>
        <Boton onClick={() => onReview(card)}>{texts.cards.review}</Boton>
        {card.kind === 'qa' && !card.hasInverse && card.inverseOfCardId === null ? (
          <Boton onClick={() => void createInverse()}>{texts.cards.createInverse}</Boton>
        ) : null}
        <Boton onClick={() => void togglePause()}>
          {card.paused ? texts.cards.resume : texts.cards.pause}
        </Boton>
        <Boton onClick={() => onHistory(card)}>{texts.cards.history}</Boton>
        {path.canOpenNote && noteId !== null && blockId !== null && onOpenNote ? (
          <Boton onClick={() => onOpenNote(noteId, blockId)}>{texts.cards.viewInNote}</Boton>
        ) : null}
        <Boton onClick={() => void remove()}>{texts.cards.remove}</Boton>
        <Boton variant="quiet" onClick={onBack}>
          {texts.cards.backToCards}
        </Boton>
      </div>
    </div>
  );
}
