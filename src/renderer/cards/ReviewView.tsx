import { useRef, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';

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
    <ScreenFrame level={3} title={texts.cards.reviewTitle}>
      <div className={styles.stack}>
        <p className={styles.block}>{card.question}</p>
        {step === 'question' ? (
          <div className={styles.actions}>
            <Boton variant="primary" onClick={() => setStep('answer')}>
              {texts.cards.showAnswer}
            </Boton>
          </div>
        ) : (
          <p className={styles.block}>{card.answer}</p>
        )}
        {step === 'answer' ? (
          <>
            {failed ? (
              <BannerEstado tone="attention">{texts.cards.reviewFailed}</BannerEstado>
            ) : null}
            <fieldset className={styles.group}>
              <legend>{texts.cards.gradeGroup}</legend>
              <div className={styles.actions}>
                {GRADES.map(({ grade: value, label }) => (
                  <Boton key={value} disabled={saving} onClick={() => grade(value)}>
                    {label}
                  </Boton>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
        {step === 'done' && result?.nextReviewDay ? (
          <>
            <p role="status" className={styles.highlight}>
              {texts.cards.nextReview(formatLongDate(result.nextReviewDay))}
            </p>
            <div className={styles.actions}>
              <Boton variant="primary" onClick={onClose}>
                {texts.cards.backToCards}
              </Boton>
            </div>
          </>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
