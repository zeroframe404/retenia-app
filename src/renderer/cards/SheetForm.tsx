import { useId, useRef, useState } from 'react';
import {
  type CardDetail,
  type CardSheetInput,
  cardsCreateRequest,
  MAX_CARD_TEXT_LENGTH,
  MAX_ESSENTIALS,
  MAX_HINTS,
} from '../../preload/contract/cards';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import cardStyles from './Cards.module.css';

const STATES = ['reviewed', 'verified', 'in_review', 'retired'] as const;
// Un campo por componente y por pista, con un nombre fijo (no por su posición).
const ESSENTIAL_SLOTS = ['primero', 'segundo', 'tercero', 'cuarto'] as const;
const HINT_SLOTS = ['primera', 'segunda', 'tercera'] as const;

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

// «¿Cambió lo que hay que recordar?»: aparece al guardar un cambio de la pregunta o la respuesta de
// una tarjeta con historial. «Cerrar» o Esc cancela el guardado: no se decide nada por vos.
function MeaningDialog({
  onChoose,
  onClose,
}: {
  onChoose: (changed: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={texts.cards.meaningTitle} onClose={onClose}>
      <p>{texts.cards.meaningBody}</p>
      <div className={cardStyles.dialogActions}>
        <Boton variant="primary" onClick={() => onChoose(false)}>
          {texts.cards.meaningNo}
        </Boton>
        <Boton onClick={() => onChoose(true)}>{texts.cards.meaningYes}</Boton>
      </div>
    </Dialog>
  );
}

// «Editar ficha» (CA-053): la pregunta y la respuesta (que, si la tarjeta nació en una nota, se
// editan en la nota), la respuesta de referencia, las variantes aceptables, hasta 4 componentes
// esenciales, hasta 3 pistas ordenadas, la explicación, la fuente, el tipo de forma y el estado.
export function SheetForm({
  card,
  onSaved,
  onCancel,
}: {
  card: CardDetail;
  onSaved: (card: CardDetail) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const sheet = card.sheet;
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [referenceAnswer, setReferenceAnswer] = useState(sheet.referenceAnswer);
  const [variants, setVariants] = useState(sheet.variants.join('\n'));
  const [essentials, setEssentials] = useState(
    Array.from({ length: MAX_ESSENTIALS }, (_, index) => sheet.essentials[index] ?? ''),
  );
  const [hints, setHints] = useState(
    Array.from({ length: MAX_HINTS }, (_, index) => sheet.hints[index] ?? ''),
  );
  const [explanation, setExplanation] = useState(sheet.explanation);
  const [source, setSource] = useState(sheet.source);
  const [formType, setFormType] = useState(sheet.formType);
  const [state, setState] = useState(sheet.state);
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const questionField = useRef<HTMLTextAreaElement>(null);
  const answerField = useRef<HTMLTextAreaElement>(null);

  const textChanged = question.trim() !== card.question || answer.trim() !== card.answer;

  function validate(): boolean {
    // El texto de una tarjeta que nació en una nota se edita en la nota: acá no se toca.
    if (card.linked) {
      return true;
    }
    const parsed = cardsCreateRequest.safeParse({ question, answer });
    const found: { question?: string; answer?: string } = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field !== 'question' && field !== 'answer') || found[field]) {
          continue;
        }
        const tooLong = issue.code === 'too_big';
        found[field] =
          field === 'question'
            ? tooLong
              ? texts.cards.questionTooLong(MAX_CARD_TEXT_LENGTH)
              : texts.cards.questionRequired
            : tooLong
              ? texts.cards.answerTooLong(MAX_CARD_TEXT_LENGTH)
              : texts.cards.answerRequired;
      }
    }
    setErrors(found);
    if (found.question) {
      questionField.current?.focus();
    } else if (found.answer) {
      answerField.current?.focus();
    }
    return !found.question && !found.answer;
  }

  async function save(meaningChanged: boolean | undefined) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    const input: CardSheetInput = {
      referenceAnswer,
      variants: lines(variants),
      essentials: essentials.map((item) => item.trim()).filter((item) => item !== ''),
      hints: hints.map((item) => item.trim()).filter((item) => item !== ''),
      explanation,
      source,
      formType,
      // «Propuesta» solo la cambia quien la propuso: guardar la ficha no la vuelve «Revisada».
      ...(state === 'proposed'
        ? {}
        : { state: STATES.find((option) => option === state) ?? 'reviewed' }),
    };
    try {
      onSaved(
        await window.retenia['cards.edit']({
          cardId: card.id,
          question: question.trim(),
          answer: answer.trim(),
          sheet: input,
          ...(meaningChanged === undefined ? {} : { meaningChanged }),
        }),
      );
    } catch {
      setFailed(true);
      inFlight.current = false;
      setSaving(false);
    }
  }

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (inFlight.current || !validate()) {
      return;
    }
    // Con historial, cambiar la pregunta o la respuesta pide decidir si cambió lo que hay que
    // recordar antes de guardar.
    if (card.hasHistory && !card.linked && textChanged) {
      setAsking(true);
      return;
    }
    void save(undefined);
  }

  return (
    <form className={styles.form} aria-label={texts.cards.sheetTitle} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${ids}-pregunta`}>{texts.cards.questionLabel}</label>
        <textarea
          id={`${ids}-pregunta`}
          ref={questionField}
          rows={3}
          value={question}
          readOnly={card.linked}
          aria-invalid={errors.question ? true : undefined}
          onChange={(event) => setQuestion(event.target.value)}
        />
        {errors.question ? <p className={styles.fieldNotice}>{errors.question}</p> : null}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-respuesta`}>{texts.cards.answerLabel}</label>
        <textarea
          id={`${ids}-respuesta`}
          ref={answerField}
          rows={3}
          value={answer}
          readOnly={card.linked}
          aria-invalid={errors.answer ? true : undefined}
          onChange={(event) => setAnswer(event.target.value)}
        />
        {errors.answer ? <p className={styles.fieldNotice}>{errors.answer}</p> : null}
        {card.linked ? <p className={cardStyles.fieldHelp}>{texts.cards.editedInNote}</p> : null}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-referencia`}>{texts.cards.referenceAnswerLabel}</label>
        <textarea
          id={`${ids}-referencia`}
          rows={2}
          value={referenceAnswer}
          onChange={(event) => setReferenceAnswer(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-variantes`}>{texts.cards.variantsLabel}</label>
        <textarea
          id={`${ids}-variantes`}
          rows={3}
          value={variants}
          onChange={(event) => setVariants(event.target.value)}
        />
      </div>
      <fieldset className={cardStyles.pair}>
        <legend>{texts.cards.essentialsLabel}</legend>
        {ESSENTIAL_SLOTS.map((slot, index) => (
          <div className={styles.field} key={slot}>
            <label className="visually-hidden" htmlFor={`${ids}-componente-${index}`}>
              {texts.cards.essentialLabel(index + 1)}
            </label>
            <input
              id={`${ids}-componente-${index}`}
              type="text"
              value={essentials[index] ?? ''}
              onChange={(event) =>
                setEssentials((current) =>
                  current.map((item, at) => (at === index ? event.target.value : item)),
                )
              }
            />
          </div>
        ))}
      </fieldset>
      <fieldset className={cardStyles.pair}>
        <legend>{texts.cards.hintsLabel}</legend>
        {HINT_SLOTS.map((slot, index) => (
          <div className={styles.field} key={slot}>
            <label htmlFor={`${ids}-pista-${index}`}>{texts.cards.hintLabel(index + 1)}</label>
            <input
              id={`${ids}-pista-${index}`}
              type="text"
              value={hints[index] ?? ''}
              onChange={(event) =>
                setHints((current) =>
                  current.map((item, at) => (at === index ? event.target.value : item)),
                )
              }
            />
          </div>
        ))}
      </fieldset>
      <div className={styles.field}>
        <label htmlFor={`${ids}-explicacion`}>{texts.cards.explanationLabel}</label>
        <textarea
          id={`${ids}-explicacion`}
          rows={3}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-fuente`}>{texts.cards.sourceLabel}</label>
        <input
          id={`${ids}-fuente`}
          type="text"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-forma`}>{texts.cards.formTypeLabel}</label>
        <select
          id={`${ids}-forma`}
          className={cardStyles.select}
          value={formType}
          onChange={(event) => setFormType(event.target.value === 'meaning' ? 'meaning' : 'exact')}
        >
          <option value="exact">{texts.cards.formTypes.exact}</option>
          <option value="meaning">{texts.cards.formTypes.meaning}</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${ids}-estado`}>{texts.cards.stateLabel}</label>
        <select
          id={`${ids}-estado`}
          className={cardStyles.select}
          value={state}
          onChange={(event) =>
            setState(STATES.find((option) => option === event.target.value) ?? 'reviewed')
          }
        >
          {state === 'proposed' ? (
            <option value="proposed" disabled>
              {texts.cards.sheetStates.proposed}
            </option>
          ) : null}
          {STATES.map((option) => (
            <option key={option} value={option}>
              {texts.cards.sheetStates[option]}
            </option>
          ))}
        </select>
      </div>
      {failed ? <BannerEstado tone="attention">{texts.cards.saveFailed}</BannerEstado> : null}
      <div className={styles.actions}>
        <Boton type="submit" variant="primary" disabled={saving}>
          {texts.cards.save}
        </Boton>
        <Boton onClick={onCancel}>{texts.cards.cancel}</Boton>
      </div>
      {asking ? (
        <MeaningDialog
          onClose={() => setAsking(false)}
          onChoose={(changed) => {
            setAsking(false);
            void save(changed);
          }}
        />
      ) : null}
    </form>
  );
}
