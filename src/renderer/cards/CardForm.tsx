import { useId, useRef, useState } from 'react';
import { type Card, cardsCreateRequest, MAX_CARD_TEXT_LENGTH } from '../../preload/contract/cards';
import { texts } from '../../preload/contract/texts';
import styles from './Cards.module.css';

type Errors = { question?: string | undefined; answer?: string | undefined };

// Valida con el mismo esquema que después valida el principal. Devuelve un mensaje por campo.
function validate(question: string, answer: string): Errors {
  const parsed = cardsCreateRequest.safeParse({ question, answer });
  const errors: Errors = {};
  if (parsed.success) {
    return errors;
  }
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if ((field !== 'question' && field !== 'answer') || errors[field]) {
      continue;
    }
    const tooLong = issue.code === 'too_big';
    if (field === 'question') {
      errors.question = tooLong
        ? texts.cards.questionTooLong(MAX_CARD_TEXT_LENGTH)
        : texts.cards.questionRequired;
    } else {
      errors.answer = tooLong
        ? texts.cards.answerTooLong(MAX_CARD_TEXT_LENGTH)
        : texts.cards.answerRequired;
    }
  }
  return errors;
}

// El formulario «Nueva tarjeta». Si falta algo, marca el campo y conserva todo lo escrito; al
// guardar se deshabilita el botón para que un doble toque no cree dos tarjetas.
export function CardForm({
  onSaved,
  onCancel,
}: {
  onSaved: (card: Card) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveInFlight = useRef(false);
  const questionField = useRef<HTMLTextAreaElement>(null);
  const answerField = useRef<HTMLTextAreaElement>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (saveInFlight.current) {
      return;
    }
    const found = validate(question, answer);
    setErrors(found);
    setSaveFailed(false);
    if (found.question || found.answer) {
      (found.question ? questionField : answerField).current?.focus();
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    try {
      onSaved(await window.retenia['cards.create']({ question, answer }));
    } catch {
      setSaveFailed(true);
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  const questionErrorId = `${ids}-pregunta-error`;
  const answerErrorId = `${ids}-respuesta-error`;
  return (
    <form className={styles.form} aria-label={texts.cards.formLabel} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${ids}-pregunta`}>{texts.cards.questionLabel}</label>
        <textarea
          id={`${ids}-pregunta`}
          ref={questionField}
          rows={3}
          value={question}
          // biome-ignore lint/a11y/noAutofocus: al abrir el formulario se escribe la pregunta enseguida.
          autoFocus
          aria-invalid={errors.question ? true : undefined}
          aria-describedby={errors.question ? questionErrorId : undefined}
          onChange={(event) => {
            setQuestion(event.target.value);
            setErrors((current) => ({ ...current, question: undefined }));
          }}
        />
        {errors.question ? (
          <p id={questionErrorId} className={styles.fieldError}>
            {errors.question}
          </p>
        ) : null}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-respuesta`}>{texts.cards.answerLabel}</label>
        <textarea
          id={`${ids}-respuesta`}
          ref={answerField}
          rows={3}
          value={answer}
          aria-invalid={errors.answer ? true : undefined}
          aria-describedby={errors.answer ? answerErrorId : undefined}
          onChange={(event) => {
            setAnswer(event.target.value);
            setErrors((current) => ({ ...current, answer: undefined }));
          }}
        />
        {errors.answer ? (
          <p id={answerErrorId} className={styles.fieldError}>
            {errors.answer}
          </p>
        ) : null}
      </div>
      {saveFailed ? <p className={styles.formError}>{texts.cards.saveFailed}</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          {texts.cards.save}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          {texts.cards.cancel}
        </button>
      </div>
    </form>
  );
}
