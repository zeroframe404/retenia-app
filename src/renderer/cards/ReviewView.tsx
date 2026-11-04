import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../preload/contract/cards';
import type { InlineNode } from '../../preload/contract/notes';
import { formatLongDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { CardFace } from './CardFace';
import { WhyToday } from './WhyToday';

type Grade = 'again' | 'hard' | 'good';

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: texts.cards.gradeAgain },
  { grade: 'hard', label: texts.cards.gradeHard },
  { grade: 'good', label: texts.cards.gradeGood },
];

// El repaso mínimo: se ve la pregunta, se intenta, después «Mostrar respuesta» y se califica.
// Al calificar los botones se deshabilitan para que un doble toque no cuente dos repasos.
// «Deshacer» (Fase 09) anula el repaso recién hecho: la tarjeta vuelve a la pregunta sin calificar
// y su próximo repaso es otra vez el de antes; volver a calificarla es otro intento.
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
  // La pregunta y la respuesta con sus fórmulas e imágenes (CA-377 y CA-378): mientras se leen o si
  // no se pueden leer, se ve el texto.
  const [faces, setFaces] = useState<{ question: InlineNode[]; answer: InlineNode[] }>({
    question: [{ type: 'text', text: card.question }],
    answer: [{ type: 'text', text: card.answer }],
  });
  useEffect(() => {
    let current = true;
    window.retenia['cards.get']({ cardId: card.id }).then(
      (detail) => {
        if (current) {
          setFaces({ question: detail.questionContent, answer: detail.answerContent });
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [card.id]);
  const [result, setResult] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  // Identifica este intento: si el repaso llega dos veces (un doble toque, un reintento después
  // de un error), el principal lo guarda una sola vez. Después de «Deshacer», el intento siguiente
  // es otro.
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());

  async function grade(value: Grade) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFailed('');
    setNotice('');
    try {
      const reviewed = await window.retenia['cards.review']({
        cardId: card.id,
        grade: value,
        attemptId,
      });
      setResult(reviewed);
      setStep('done');
      setSaving(false);
      onReviewed(reviewed);
    } catch {
      setFailed(texts.cards.reviewFailed);
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function undo() {
    if (saving) {
      return;
    }
    setSaving(true);
    setFailed('');
    try {
      const restored = await window.retenia['cards.undoReview']({ cardId: card.id, attemptId });
      setNotice(
        restored.nextReviewDay === null
          ? texts.cards.reviewAnnulledNew
          : texts.cards.reviewAnnulled(formatLongDate(restored.nextReviewDay)),
      );
      setResult(null);
      setAttemptId(crypto.randomUUID());
      setStep('question');
      inFlight.current = false;
      onReviewed(restored);
    } catch {
      setFailed(texts.cards.undoFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenFrame level={3} title={texts.cards.reviewTitle}>
      <div className={styles.stack}>
        {notice === '' ? null : (
          <p role="status" className={styles.highlight}>
            {notice}
          </p>
        )}
        <div className={styles.block}>
          <CardFace content={faces.question} />
        </div>
        {step === 'question' ? (
          <div className={styles.actions}>
            <Boton variant="primary" onClick={() => setStep('answer')}>
              {texts.cards.showAnswer}
            </Boton>
          </div>
        ) : (
          <div className={styles.block}>
            <CardFace content={faces.answer} />
          </div>
        )}
        {failed === '' ? null : <BannerEstado tone="attention">{failed}</BannerEstado>}
        {step === 'answer' ? (
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
              <Boton disabled={saving} onClick={() => void undo()}>
                {texts.cards.undoReview}
              </Boton>
            </div>
          </>
        ) : (
          <>
            <WhyToday key={attemptId} cardId={card.id} />
            <div className={styles.actions}>
              <Boton variant="quiet" onClick={onClose}>
                {texts.cards.backToCards}
              </Boton>
            </div>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
