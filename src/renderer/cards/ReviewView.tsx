import { useRef, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';

type Grade = 'again' | 'hard' | 'good';

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: texts.cards.gradeAgain },
  { grade: 'hard', label: texts.cards.gradeHard },
  { grade: 'good', label: texts.cards.gradeGood },
];

// El repaso mínimo: se ve la pregunta, se intenta, después «Mostrar respuesta» y se califica.
// Al calificar los botones se deshabilitan para que un doble toque no cuente dos repasos.
export function ReviewView({
  card,
  onReviewed,
  onClose,
}: {
  card: Card;
  onReviewed: (card: Card) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'question' | 'answer' | 'done'>('question');
  const [result, setResult] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  // Identifica este intento: si el repaso llega dos veces (un doble toque, un reintento después
  // de un error), el principal lo guarda una sola vez.
  const [attemptId] = useState(() => crypto.randomUUID());

  async function grade(value: Grade) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const reviewed = await window.retenia['cards.review']({
        cardId: card.id,
        grade: value,
        attemptId,
      });
      setResult(reviewed);
      setStep('done');
      onReviewed(reviewed);
    } catch {
      setFailed(true);
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={styles.review} aria-labelledby="titulo-repaso">
      <h2 id="titulo-repaso">{texts.cards.reviewTitle}</h2>
      <p className={styles.reviewText}>{card.question}</p>
      {step === 'question' ? (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setStep('answer')}>
            {texts.cards.showAnswer}
          </button>
        </div>
      ) : (
        <p className={styles.reviewText}>{card.answer}</p>
      )}
      {step === 'answer' ? (
        <>
          {failed ? <p className={styles.formError}>{texts.cards.reviewFailed}</p> : null}
          <fieldset className={styles.grades}>
            <legend>{texts.cards.gradeGroup}</legend>
            <div className={styles.actions}>
              {GRADES.map(({ grade: value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={styles.secondary}
                  disabled={saving}
                  onClick={() => grade(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}
      {step === 'done' && result?.nextReviewDay ? (
        <>
          <p role="status" className={styles.nextReview}>
            {texts.cards.nextReview(formatLongDate(result.nextReviewDay))}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onClose}>
              {texts.cards.backToCards}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
