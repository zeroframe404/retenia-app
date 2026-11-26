import { type Ref, useId } from 'react';
import type { DiffStepValue } from '../../preload/contract/activities';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from './Practice.module.css';

// Las entradas de cada tipo de actividad (H-31): respuesta corta, numérica, opciones, ordenar
// pasos y respuesta abierta. Cualquier interacción empieza el intento (`onStart`).

export function TextAnswer({
  value,
  rows,
  readOnly,
  onChange,
  inputRef,
}: {
  value: string;
  rows: number;
  readOnly: boolean;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLTextAreaElement> | undefined;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className="visually-hidden" htmlFor={id}>
        {texts.practice.answerLabel}
      </label>
      <textarea
        ref={inputRef}
        id={id}
        className={styles.textarea}
        rows={rows}
        placeholder={texts.practice.answerPlaceholder}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function NumberAnswer({
  value,
  unit,
  readOnly,
  onChange,
  inputRef,
}: {
  value: string;
  unit: string | null;
  readOnly: boolean;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement> | undefined;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{texts.practice.numberLabel}</label>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={texts.practice.answerPlaceholder}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      {unit === null ? null : (
        <span className={styles.unitHint}>{texts.practice.inUnit(unit)}</span>
      )}
    </div>
  );
}

// Tres opciones, mezcladas (CA-133). Después de enviar quedan fijas.
export function ChoiceAnswer({
  options,
  chosen,
  locked,
  onChoose,
  legend = texts.practice.optionsLegend,
}: {
  // En una decisión (Fase 18), «¿Qué método usarías? No lo resuelvas».
  legend?: string | undefined;
  options: readonly { id: string; text: string }[];
  chosen: string | null;
  locked: boolean;
  onChoose: (id: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choices}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className={styles.choice}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={chosen === option.id}
            disabled={locked}
            onChange={() => onChoose(option.id)}
          />
          <span>{option.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Ordenar pasos con «Subir» y «Bajar» (se puede todo con el teclado). Después de enviar, cada paso
// dice si quedó en su lugar.
export function OrderAnswer({
  steps,
  marks,
  onMove,
}: {
  steps: readonly { id: string; text: string }[];
  // Después de enviar: si cada paso quedó en su lugar.
  marks: readonly boolean[] | null;
  onMove: (from: number, to: number) => void;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.diffTitle}>
        {texts.practice.orderLegend}
      </h3>
      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const ok = marks?.[index];
          return (
            <li
              key={step.id}
              className={styles.step}
              data-step={ok === undefined ? undefined : ok ? 'ok' : 'wrong'}
            >
              <span className={styles.position}>{texts.practice.stepPosition(index + 1)}</span>
              <span className={styles.stepText}>
                {ok === undefined
                  ? step.text
                  : ok
                    ? texts.practice.stepOk(step.text)
                    : texts.practice.stepWrong(step.text)}
              </span>
              {marks === null ? (
                <span className={styles.actions}>
                  <Boton
                    variant="quiet"
                    disabled={index === 0}
                    aria-label={texts.practice.moveUp(step.text)}
                    onClick={() => onMove(index, index - 1)}
                  >
                    {texts.practice.up}
                  </Boton>
                  <Boton
                    variant="quiet"
                    disabled={index === steps.length - 1}
                    aria-label={texts.practice.moveDown(step.text)}
                    onClick={() => onMove(index, index + 1)}
                  >
                    {texts.practice.down}
                  </Boton>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// La diferencia letra por letra (CA-131): las letras distintas van subrayadas y con color (nunca
// rojo), y la lista de diferencias también se dice en palabras.
export function LetterDiff({ diff }: { diff: readonly DiffStepValue[] }) {
  const words = diff.flatMap((step) => {
    if (step.op === 'changed') {
      return [texts.practice.letterChanged(step.written ?? '', step.expected ?? '')];
    }
    if (step.op === 'extra') {
      return [texts.practice.letterExtra(step.written ?? '')];
    }
    if (step.op === 'missing') {
      return [texts.practice.letterMissing(step.expected ?? '')];
    }
    return [];
  });
  return (
    <section className={styles.diff} aria-label={texts.practice.diffLabel}>
      <p className={styles.diffLine}>
        <span className={styles.diffTitle}>{texts.practice.yourAnswer}</span>
        <span className={styles.letters} aria-hidden="true">
          {diff.map((step, index) =>
            step.op === 'missing' ? null : (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: las letras se repiten; vale su lugar.
                key={index}
                className={styles.letter}
                data-letter={step.op}
              >
                {step.written}
              </span>
            ),
          )}
        </span>
      </p>
      <p className={styles.diffLine}>
        <span className={styles.diffTitle}>{texts.practice.expected}</span>
        <span className={styles.letters} aria-hidden="true">
          {diff.map((step, index) =>
            step.op === 'extra' ? null : (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: las letras se repiten; vale su lugar.
                key={index}
                className={styles.letter}
                data-letter={step.op}
              >
                {step.expected}
              </span>
            ),
          )}
        </span>
      </p>
      <p className="visually-hidden">{words.join(' · ')}</p>
    </section>
  );
}
