import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ImproveCards } from '../../preload/contract/objectives';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog, ItemList, ListItem, Toast } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import styles from './Progress.module.css';

type Card = ImproveCards['cards'][number];

// Las dos tarjetas de «Dividir en dos».
const PART_KEYS = ['primera', 'segunda'] as const;

// Progreso › «Mejorar la tarjeta» (CA-154): las tarjetas que salieron de los repasos por
// dificultad recurrente, con «Reformular», «Dividir en dos», «Agregar una pista» y «Ver en el
// original».
export function ImproveSection({
  onEdit,
  onOpenOriginal,
}: {
  onEdit: (cardId: string, improve: 'rephrase' | 'hint') => void;
  onOpenOriginal: (cardId: string) => void;
}) {
  const [list, setList] = useState<ImproveCards | null>(null);
  const [failed, setFailed] = useState(false);
  const [splitting, setSplitting] = useState<Card | null>(null);
  const [toast, setToast] = useState('');
  const text = texts.progress.improveSection;

  const load = useCallback(async () => {
    try {
      setList(await window.retenia['progress.improveCard.list']({}));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <ViewState
        kind="error"
        phrase={text.loadFailed}
        action={{ text: texts.progress.retry, onClick: () => void load() }}
      />
    );
  }
  if (list === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  return (
    <div className={styles.section}>
      <Toast>{toast}</Toast>
      <p className={styles.note}>{text.intro}</p>
      {list.cards.length === 0 ? (
        <ViewState kind="empty" phrase={text.empty} />
      ) : (
        <ItemList label={texts.progress.improve}>
          {list.cards.map((card) => (
            <ListItem
              key={card.cardId}
              title={card.question}
              detail={
                card.reason === 'total' ? text.total(card.failures) : text.thirtyDays(card.failures)
              }
            >
              <div className={styles.actions}>
                <Boton onClick={() => onEdit(card.cardId, 'rephrase')}>{text.rephrase}</Boton>
                <Boton onClick={() => setSplitting(card)}>{text.split}</Boton>
                <Boton onClick={() => onEdit(card.cardId, 'hint')}>{text.addHint}</Boton>
                <Boton
                  variant="quiet"
                  disabled={!card.hasCite}
                  title={card.hasCite ? undefined : text.noSource}
                  onClick={() => onOpenOriginal(card.cardId)}
                >
                  {text.viewOriginal}
                </Boton>
              </div>
              {card.hasCite ? null : <p className={styles.note}>{text.noSource}</p>}
            </ListItem>
          ))}
        </ItemList>
      )}
      {splitting === null ? null : (
        <SplitDialog
          card={splitting}
          onClose={() => setSplitting(null)}
          onDone={() => {
            setSplitting(null);
            setToast(text.splitDone);
            void load();
          }}
        />
      )}
    </div>
  );
}

function SplitDialog({
  card,
  onClose,
  onDone,
}: {
  card: Card;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const [splitId] = useState(() => crypto.randomUUID());
  const [parts, setParts] = useState([
    { question: card.question, answer: card.answer },
    { question: '', answer: '' },
  ]);
  const [problem, setProblem] = useState('');
  const sending = useRef(false);
  const text = texts.progress.improveSection;
  const ready = parts.every((part) => part.question.trim() !== '' && part.answer.trim() !== '');

  async function save() {
    if (sending.current || !ready) {
      return;
    }
    sending.current = true;
    try {
      await window.retenia['progress.improveCard.split']({
        splitId,
        cardId: card.cardId,
        parts: parts.map((part) => ({
          question: part.question.trim(),
          answer: part.answer.trim(),
        })),
      });
      onDone();
    } catch {
      setProblem(text.failed);
      sending.current = false;
    }
  }

  const update = (index: number, field: 'question' | 'answer', value: string) =>
    setParts((current) =>
      current.map((part, at) => (at === index ? { ...part, [field]: value } : part)),
    );

  return (
    <Dialog title={text.splitTitle} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className={styles.help}>{text.splitHelp}</p>
        {PART_KEYS.map((key, index) => (
          <fieldset key={key} className={styles.field}>
            <legend>{text.part(index + 1)}</legend>
            <label htmlFor={`${ids}-pregunta-${index}`}>{text.question}</label>
            <textarea
              id={`${ids}-pregunta-${index}`}
              className={styles.input}
              rows={2}
              value={parts[index]?.question ?? ''}
              onChange={(event) => update(index, 'question', event.target.value)}
            />
            <label htmlFor={`${ids}-respuesta-${index}`}>{text.answer}</label>
            <textarea
              id={`${ids}-respuesta-${index}`}
              className={styles.input}
              rows={2}
              value={parts[index]?.answer ?? ''}
              onChange={(event) => update(index, 'answer', event.target.value)}
            />
          </fieldset>
        ))}
        {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        <div className={styles.actions}>
          <Boton variant="primary" type="submit" disabled={!ready}>
            {text.splitSave}
          </Boton>
          <Boton variant="quiet" onClick={onClose}>
            {texts.progress.panel.cancel}
          </Boton>
        </div>
      </form>
    </Dialog>
  );
}
