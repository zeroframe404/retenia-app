import { useId } from 'react';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import formStyles from '../ui/Form.module.css';
import type { FamilyDraft } from './familyText';
import styles from './Practice.module.css';

// Los editores de la Fase 18: la familia de variantes, los pasos de un procedimiento, los métodos
// de una decisión y los tipos de un conjunto mezclado.

const editor = texts.practice.editor;
const newId = (): string => crypto.randomUUID();

const MAX_PROCEDURE_STEPS = 8;
const MIN_PROCEDURE_STEPS = 2;
const MAX_METHODS = 5;
const MIN_METHODS = 2;
const MAX_TYPES = 5;
const MIN_TYPES = 2;

export const blankProcedureStep = (key = false) => ({
  id: newId(),
  prompt: '',
  resultType: 'number' as 'number' | 'text',
  expected: '',
  tolerance: '0',
  unit: '',
  explanation: '',
  key,
});

export const blankMethod = (correct = false) => ({ id: newId(), text: '', why: '', correct });

export const blankType = () => ({ id: newId(), name: '', cardIds: [] as string[] });

function Field({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number | undefined;
}) {
  const id = useId();
  return (
    <div className={formStyles.field}>
      <label htmlFor={id}>{label}</label>
      {rows === undefined ? (
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function FamilyEditor({
  family,
  onChange,
}: {
  family: FamilyDraft;
  onChange: (family: FamilyDraft) => void;
}) {
  const set = (patch: Partial<FamilyDraft>) => onChange({ ...family, ...patch });
  return (
    <fieldset className={styles.editorGroup}>
      <legend>{editor.familyLegend}</legend>
      <Field
        label={editor.statements}
        rows={3}
        value={family.statements}
        onChange={(statements) => set({ statements })}
      />
      <p className={styles.unitHint}>{editor.statementsHelp}</p>
      <Field
        label={editor.parameters}
        rows={3}
        value={family.parameters}
        onChange={(parameters) => set({ parameters })}
      />
      <Field
        label={editor.derived}
        rows={2}
        value={family.derived}
        onChange={(derived) => set({ derived })}
      />
    </fieldset>
  );
}

type Steps = ReturnType<typeof blankProcedureStep>[];

export function ProcedureEditor({
  steps,
  onChange,
}: {
  steps: Steps;
  onChange: (steps: Steps) => void;
}) {
  const ids = useId();
  const patch = (index: number, change: Partial<Steps[number]>) =>
    onChange(steps.map((step, at) => (at === index ? { ...step, ...change } : step)));
  return (
    <fieldset className={styles.editorGroup}>
      <legend>{editor.procedureLegend}</legend>
      <p className={styles.unitHint}>{editor.expectedHelp}</p>
      {steps.map((step, index) => (
        <div key={step.id} className={styles.editorRow}>
          <Field
            label={editor.procedurePrompt(index + 1)}
            value={step.prompt}
            onChange={(prompt) => patch(index, { prompt })}
          />
          <div className={formStyles.field}>
            <label htmlFor={`${ids}-tipo-${index}`}>{editor.resultType(index + 1)}</label>
            <select
              id={`${ids}-tipo-${index}`}
              value={step.resultType}
              onChange={(event) =>
                patch(index, { resultType: event.target.value === 'text' ? 'text' : 'number' })
              }
            >
              <option value="number">{editor.numberResult}</option>
              <option value="text">{editor.textResult}</option>
            </select>
          </div>
          <Field
            label={editor.expectedNumber(index + 1)}
            value={step.expected}
            onChange={(expected) => patch(index, { expected })}
          />
          {step.resultType === 'number' ? (
            <>
              <Field
                label={editor.stepTolerance(index + 1)}
                value={step.tolerance}
                onChange={(tolerance) => patch(index, { tolerance })}
              />
              <Field
                label={editor.stepUnit(index + 1)}
                value={step.unit}
                onChange={(unit) => patch(index, { unit })}
              />
            </>
          ) : null}
          <Field
            label={editor.stepExplanation(index + 1)}
            rows={2}
            value={step.explanation}
            onChange={(explanation) => patch(index, { explanation })}
          />
          <label className={styles.editorInline}>
            <input
              type="checkbox"
              checked={step.key}
              onChange={(event) => patch(index, { key: event.target.checked })}
            />
            {editor.keyStep(index + 1)}
          </label>
          <Boton
            variant="quiet"
            disabled={steps.length <= MIN_PROCEDURE_STEPS}
            onClick={() => onChange(steps.filter((_, at) => at !== index))}
          >
            {editor.removeProcedureStep(index + 1)}
          </Boton>
        </div>
      ))}
      <Boton
        disabled={steps.length >= MAX_PROCEDURE_STEPS}
        onClick={() => onChange([...steps, blankProcedureStep()])}
      >
        {editor.addStep}
      </Boton>
    </fieldset>
  );
}

type Methods = ReturnType<typeof blankMethod>[];

export function DecisionEditor({
  methods,
  onChange,
}: {
  methods: Methods;
  onChange: (methods: Methods) => void;
}) {
  const name = useId();
  const patch = (index: number, change: Partial<Methods[number]>) =>
    onChange(methods.map((method, at) => (at === index ? { ...method, ...change } : method)));
  return (
    <fieldset className={styles.editorGroup}>
      <legend>{editor.methodsLegend}</legend>
      {methods.map((method, index) => (
        <div key={method.id} className={styles.editorRow}>
          <Field
            label={editor.method(index + 1)}
            value={method.text}
            onChange={(value) => patch(index, { text: value })}
          />
          <label className={styles.editorInline}>
            <input
              type="radio"
              name={name}
              checked={method.correct}
              onChange={() =>
                onChange(methods.map((item, at) => ({ ...item, correct: at === index })))
              }
            />
            {editor.methodCorrect(index + 1)}
          </label>
          <Field
            label={editor.methodWhy(index + 1)}
            value={method.why}
            onChange={(why) => patch(index, { why })}
          />
          <Boton
            variant="quiet"
            disabled={methods.length <= MIN_METHODS}
            onClick={() => onChange(methods.filter((_, at) => at !== index))}
          >
            {editor.removeMethod(index + 1)}
          </Boton>
        </div>
      ))}
      <Boton
        disabled={methods.length >= MAX_METHODS}
        onClick={() => onChange([...methods, blankMethod()])}
      >
        {editor.addMethod}
      </Boton>
    </fieldset>
  );
}

type Types = ReturnType<typeof blankType>[];

export interface ExerciseChoice {
  id: string;
  question: string;
}

export function SetEditor({
  types,
  exercises,
  onChange,
}: {
  types: Types;
  // Los ejercicios de la materia que se pueden poner en un tipo.
  exercises: readonly ExerciseChoice[];
  onChange: (types: Types) => void;
}) {
  const patch = (index: number, change: Partial<Types[number]>) =>
    onChange(types.map((type, at) => (at === index ? { ...type, ...change } : type)));
  return (
    <fieldset className={styles.editorGroup}>
      <legend>{editor.typesLegend}</legend>
      <p className={styles.unitHint}>{editor.typesHelp}</p>
      {exercises.length === 0 ? <p>{editor.noExercises}</p> : null}
      {types.map((type, index) => (
        <div key={type.id} className={styles.editorRow}>
          <Field
            label={editor.typeName(index + 1)}
            value={type.name}
            onChange={(name) => patch(index, { name })}
          />
          <fieldset className={styles.choices}>
            <legend>{editor.typeProblems(index + 1)}</legend>
            {exercises.map((exercise) => (
              <label key={exercise.id} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={type.cardIds.includes(exercise.id)}
                  // Cada problema va en un solo tipo.
                  disabled={
                    !type.cardIds.includes(exercise.id) &&
                    types.some((other) => other.cardIds.includes(exercise.id))
                  }
                  onChange={(event) =>
                    patch(index, {
                      cardIds: event.target.checked
                        ? [...type.cardIds, exercise.id]
                        : type.cardIds.filter((id) => id !== exercise.id),
                    })
                  }
                />
                <span>{exercise.question}</span>
              </label>
            ))}
          </fieldset>
          <Boton
            variant="quiet"
            disabled={types.length <= MIN_TYPES}
            onClick={() => onChange(types.filter((_, at) => at !== index))}
          >
            {editor.removeType(index + 1)}
          </Boton>
        </div>
      ))}
      <Boton disabled={types.length >= MAX_TYPES} onClick={() => onChange([...types, blankType()])}>
        {editor.addType}
      </Boton>
    </fieldset>
  );
}
