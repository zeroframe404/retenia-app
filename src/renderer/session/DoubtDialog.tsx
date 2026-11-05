import { useId, useRef, useState } from 'react';
import { MAX_DOUBT_LENGTH } from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import formStyles from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Session.module.css';

// La opción «Sobre la sesión en general» del selector de tarjeta.
const GENERAL = '';

// «Guardar una duda» (CA-076): el texto y de qué tarjeta salió (en el cierre, una de las de la
// sesión; desde la pantalla de una tarjeta, esa). Aparece en Progreso › «Dudas y revisiones». El
// identificador se genera al abrir el cuadro: guardar dos veces no agrega otra.
export function DoubtDialog({
  cards,
  defaultCardId,
  sessionId,
  onClose,
  onSaved,
}: {
  cards: readonly { cardId: string; question: string }[];
  defaultCardId: string | null;
  sessionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ids = useId();
  const [doubtId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState('');
  const [cardId, setCardId] = useState(defaultCardId ?? GENERAL);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) {
      return;
    }
    if (text.trim() === '') {
      setProblem(texts.study.doubt.empty);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setProblem('');
    try {
      await window.retenia['doubts.create']({
        doubtId,
        text: text.trim(),
        cardId: cardId === GENERAL ? null : cardId,
        sessionId,
      });
      onSaved();
    } catch {
      setProblem(texts.study.doubt.failed);
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog title={texts.study.doubt.title} onClose={onClose}>
      <form
        className={formStyles.inline}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={formStyles.field}>
          <label htmlFor={`${ids}-texto`}>{texts.study.doubt.label}</label>
          <textarea
            id={`${ids}-texto`}
            className={styles.wide}
            rows={3}
            maxLength={MAX_DOUBT_LENGTH}
            value={text}
            aria-invalid={problem === texts.study.doubt.empty ? true : undefined}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {cards.length > 1 || sessionId !== null ? (
          <div className={formStyles.field}>
            <label htmlFor={`${ids}-tarjeta`}>{texts.study.doubt.card}</label>
            <select
              id={`${ids}-tarjeta`}
              className={styles.select}
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
            >
              {cards.map((card) => (
                <option key={card.cardId} value={card.cardId}>
                  {card.question}
                </option>
              ))}
              <option value={GENERAL}>{texts.study.doubt.noCard}</option>
            </select>
          </div>
        ) : null}
        {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        <div className={styles.dialogActions}>
          <Boton type="submit" variant="primary" disabled={saving}>
            {texts.study.doubt.save}
          </Boton>
          <Boton onClick={onClose}>{texts.study.doubt.cancel}</Boton>
        </div>
      </form>
    </Dialog>
  );
}
