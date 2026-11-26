import { useEffect, useId } from 'react';
import type { ActivityValue } from '../../preload/contract/activities';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import formStyles from '../ui/Form.module.css';
import type { ReferenceField } from './ExerciseView';
import { type FamilyDraft, familyDraftOf, familyOf } from './familyText';
import {
  blankMethod,
  blankProcedureStep,
  blankType,
  DecisionEditor,
  type ExerciseChoice,
  FamilyEditor,
  ProcedureEditor,
  SetEditor,
} from './MethodEditors';
import { readEditorNumber } from './numbers';
import styles from './Practice.module.css';

// El editor de cada tipo de actividad en la ficha (Fase 16, tarea 2): respuesta corta, numérica
// (valor, margen y unidad opcional), exactamente 3 opciones con su explicación, de 3 a 8 pasos en
// orden y de 2 a 4 unidades de idea. Lo que el núcleo exige se vuelve a comprobar al guardar.

type ActivityKind = 'card' | ActivityValue['type'];

export interface ActivityDraft {
  type: ActivityKind;
  value: string;
  tolerance: string;
  unit: string;
  options: { id: string; text: string; correct: boolean; explanation: string }[];
  steps: { id: string; text: string }[];
  units: { id: string; text: string }[];
  acceptedOrders: string[][];
  // Fase 18: las variantes (de un numérico o un procedimiento), los pasos, los métodos y los tipos.
  withVariants: boolean;
  family: FamilyDraft;
  formula: string;
  procedureSteps: ReturnType<typeof blankProcedureStep>[];
  methods: ReturnType<typeof blankMethod>[];
  types: ReturnType<typeof blankType>[];
}

const newId = () => crypto.randomUUID();
const KINDS: readonly ActivityKind[] = [
  'card',
  'short',
  'numeric',
  'options',
  'order',
  'open',
  'procedure',
  'decision',
  'interleaved',
];
const MAX_STEPS = 8;
const MIN_STEPS = 3;
const MAX_UNITS = 4;
const MIN_UNITS = 2;

const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6, useGrouping: false });

export function draftOf(activity: ActivityValue | null): ActivityDraft {
  const empty: ActivityDraft = {
    type: activity?.type ?? 'card',
    value: '',
    tolerance: '0',
    unit: '',
    options: [0, 1, 2].map((index) => ({
      id: newId(),
      text: '',
      correct: index === 0,
      explanation: '',
    })),
    steps: [0, 1, 2].map(() => ({ id: newId(), text: '' })),
    units: [0, 1].map(() => ({ id: newId(), text: '' })),
    acceptedOrders: [],
    withVariants: false,
    family: familyDraftOf(null),
    formula: '',
    procedureSteps: [blankProcedureStep(true), blankProcedureStep()],
    methods: [blankMethod(true), blankMethod()],
    types: [blankType(), blankType()],
  };
  switch (activity?.type) {
    case 'numeric':
      return {
        ...empty,
        value: decimal.format(activity.value),
        tolerance: decimal.format(activity.tolerance),
        unit: activity.unit ?? '',
        withVariants: Boolean(activity.family),
        family: familyDraftOf(activity.family),
        formula: activity.formula ?? '',
      };
    case 'options':
      return { ...empty, options: activity.options.map((option) => ({ ...option })) };
    case 'order':
      return {
        ...empty,
        steps: activity.steps.map((step) => ({ ...step })),
        acceptedOrders: activity.acceptedOrders.map((order) => [...order]),
      };
    case 'open':
      return { ...empty, units: activity.units.map((unit) => ({ ...unit })) };
    case 'procedure':
      return {
        ...empty,
        withVariants: activity.family !== null,
        family: familyDraftOf(activity.family),
        procedureSteps: activity.steps.map((step) => ({
          id: step.id,
          prompt: step.prompt,
          resultType: step.expected.type,
          expected: step.expected.type === 'number' ? step.expected.formula : step.expected.text,
          tolerance:
            step.expected.type === 'number' ? decimal.format(step.expected.tolerance) : '0',
          unit: step.expected.type === 'number' ? (step.expected.unit ?? '') : '',
          explanation: step.explanation,
          key: step.key,
        })),
      };
    case 'decision':
      return {
        ...empty,
        methods: activity.options.map((option) => ({
          id: option.id,
          text: option.text,
          why: option.explanation,
          correct: option.correct,
        })),
      };
    case 'interleaved':
      return {
        ...empty,
        types: activity.types.map((type) => ({ ...type, cardIds: [...type.cardIds] })),
      };
    default:
      return empty;
  }
}

type Problem = keyof typeof texts.practice.editor.problems;

// La actividad que se guarda, o el primer problema que hay que arreglar.
// Dos textos iguales (sin contar mayúsculas ni espacios de más) no se distinguen al practicar.
function repeated(items: readonly string[]): boolean {
  const seen = items.map((item) => item.trim().toLowerCase().replace(/\s+/g, ' '));
  return new Set(seen).size !== seen.length;
}

export function activityOf(
  draft: ActivityDraft,
): { activity: ActivityValue | null } | { problem: Problem } {
  const blank = (text: string) => text.trim() === '';
  switch (draft.type) {
    case 'card':
      return { activity: null };
    case 'short':
      return { activity: { type: 'short' } };
    case 'numeric': {
      // Con variantes, la respuesta de cada una sale de la fórmula: no se escribe un valor.
      const value = draft.withVariants ? 0 : readEditorNumber(draft.value);
      const tolerance = readEditorNumber(draft.tolerance === '' ? '0' : draft.tolerance);
      if (value === null) {
        return { problem: 'value' };
      }
      if (tolerance === null || tolerance < 0) {
        return { problem: 'tolerance' };
      }
      const unit = draft.unit.trim();
      if (unit.length > 20) {
        return { problem: 'unit' };
      }
      const base = {
        type: 'numeric' as const,
        value,
        tolerance,
        unit: unit === '' ? null : unit,
      };
      if (!draft.withVariants) {
        return { activity: base };
      }
      const built = familyOf(draft.family);
      if ('problem' in built) {
        return { problem: built.problem };
      }
      if (blank(draft.formula)) {
        return { problem: 'formula' };
      }
      return { activity: { ...base, family: built.family, formula: draft.formula.trim() } };
    }
    case 'options': {
      if (draft.options.some((option) => blank(option.text))) {
        return { problem: 'optionsBlank' };
      }
      if (repeated(draft.options.map((option) => option.text))) {
        return { problem: 'optionsRepeated' };
      }
      if (draft.options.filter((option) => option.correct).length !== 1) {
        return { problem: 'optionsCorrect' };
      }
      if (draft.options.some((option) => !option.correct && blank(option.explanation))) {
        return { problem: 'optionsExplanation' };
      }
      return {
        activity: {
          type: 'options',
          options: draft.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            correct: option.correct,
            explanation: option.correct ? '' : option.explanation.trim(),
          })),
        },
      };
    }
    case 'order': {
      if (draft.steps.some((step) => blank(step.text))) {
        return { problem: 'stepsBlank' };
      }
      if (draft.steps.length < MIN_STEPS || draft.steps.length > MAX_STEPS) {
        return { problem: 'stepsCount' };
      }
      if (repeated(draft.steps.map((step) => step.text))) {
        return { problem: 'stepsRepeated' };
      }
      const ids = new Set(draft.steps.map((step) => step.id));
      return {
        activity: {
          type: 'order',
          steps: draft.steps.map((step) => ({ id: step.id, text: step.text.trim() })),
          // Un orden aceptado que nombra pasos que ya no están no sirve más.
          acceptedOrders: draft.acceptedOrders.filter(
            (order) => order.length === ids.size && order.every((id) => ids.has(id)),
          ),
        },
      };
    }
    case 'open': {
      if (draft.units.some((unit) => blank(unit.text))) {
        return { problem: 'unitsBlank' };
      }
      if (draft.units.length < MIN_UNITS || draft.units.length > MAX_UNITS) {
        return { problem: 'unitsCount' };
      }
      return {
        activity: {
          type: 'open',
          units: draft.units.map((unit) => ({ id: unit.id, text: unit.text.trim() })),
        },
      };
    }
    case 'procedure': {
      const incomplete = draft.procedureSteps.some(
        (step) => blank(step.prompt) || blank(step.expected) || blank(step.explanation),
      );
      if (incomplete) {
        return { problem: 'emptyStep' };
      }
      if (!draft.procedureSteps.some((step) => step.key)) {
        return { problem: 'keyStep' };
      }
      const steps = [];
      for (const step of draft.procedureSteps) {
        const base = {
          id: step.id,
          prompt: step.prompt.trim(),
          explanation: step.explanation.trim(),
          key: step.key,
        };
        if (step.resultType === 'text') {
          steps.push({
            ...base,
            expected: { type: 'text' as const, text: step.expected.trim() },
          });
          continue;
        }
        const tolerance = readEditorNumber(step.tolerance === '' ? '0' : step.tolerance);
        if (tolerance === null || tolerance < 0) {
          return { problem: 'tolerance' };
        }
        const unit = step.unit.trim();
        steps.push({
          ...base,
          expected: {
            type: 'number' as const,
            formula: step.expected.trim(),
            tolerance,
            unit: unit === '' ? null : unit,
          },
        });
      }
      if (!draft.withVariants) {
        return { activity: { type: 'procedure', steps, family: null } };
      }
      const built = familyOf(draft.family);
      return 'problem' in built
        ? { problem: built.problem }
        : { activity: { type: 'procedure', steps, family: built.family } };
    }
    case 'decision': {
      if (draft.methods.some((method) => blank(method.text) || blank(method.why))) {
        return { problem: 'methodsBlank' };
      }
      if (repeated(draft.methods.map((method) => method.text))) {
        return { problem: 'optionsRepeated' };
      }
      if (draft.methods.filter((method) => method.correct).length !== 1) {
        return { problem: 'optionsCorrect' };
      }
      return {
        activity: {
          type: 'decision',
          options: draft.methods.map((method) => ({
            id: method.id,
            text: method.text.trim(),
            correct: method.correct,
            explanation: method.why.trim(),
          })),
        },
      };
    }
    case 'interleaved': {
      if (draft.types.some((type) => blank(type.name))) {
        return { problem: 'typesBlank' };
      }
      if (repeated(draft.types.map((type) => type.name))) {
        return { problem: 'typesRepeated' };
      }
      if (draft.types.some((type) => type.cardIds.length === 0)) {
        return { problem: 'typesEmpty' };
      }
      return {
        activity: {
          type: 'interleaved',
          types: draft.types.map((type) => ({
            id: type.id,
            name: type.name.trim(),
            cardIds: type.cardIds,
          })),
        },
      };
    }
  }
}

// Lo que se guarda como «Respuesta» de un ejercicio que no es de respuesta corta: un resumen de la
// referencia (lo que se busca y lo que se exporta).
export function answerOf(activity: ActivityValue): string | null {
  switch (activity.type) {
    case 'numeric':
      // Con variantes no hay una respuesta fija.
      return activity.family
        ? texts.cards.variantAnswer
        : `${decimal.format(activity.value)}${activity.unit === null ? '' : ` ${activity.unit}`}`;
    case 'options':
      return activity.options.find((option) => option.correct)?.text ?? null;
    case 'order':
      return activity.steps.map((step) => step.text).join(' · ');
    case 'open':
      return activity.units.map((unit) => unit.text).join(' · ');
    // La de un procedimiento, un conjunto o una decisión la arma el principal desde la actividad.
    case 'procedure':
      return activity.steps.map((step, n) => `${n + 1}. ${step.prompt}`).join(' · ');
    case 'decision':
      return activity.options.find((option) => option.correct)?.text ?? null;
    case 'interleaved':
      return activity.types.map((type) => type.name).join(' · ');
    default:
      return null;
  }
}

export function ActivityEditor({
  draft,
  onChange,
  focusField,
  exercises = [],
}: {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  // Para el conjunto mezclado: los ejercicios de la materia.
  exercises?: readonly ExerciseChoice[] | undefined;
  // La parte de la referencia a corregir («La referencia está incompleta»): recibe el foco al abrir.
  focusField?: ReferenceField | undefined;
}) {
  const ids = useId();
  useEffect(() => {
    const target =
      focusField === 'numeric'
        ? `${ids}-valor`
        : focusField === 'options'
          ? `${ids}-opcion-0`
          : focusField === 'steps'
            ? `${ids}-paso-0`
            : focusField === 'units'
              ? `${ids}-unidad-0`
              : null;
    if (target !== null) {
      document.getElementById(target)?.focus();
    }
  }, [focusField, ids]);
  const editor = texts.practice.editor;
  const set = (patch: Partial<ActivityDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <div className={formStyles.field}>
        <label htmlFor={`${ids}-tipo`}>{editor.typeLabel}</label>
        <select
          id={`${ids}-tipo`}
          value={draft.type}
          onChange={(event) =>
            set({ type: KINDS.find((kind) => kind === event.target.value) ?? 'card' })
          }
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {editor.types[kind]}
            </option>
          ))}
        </select>
        {draft.type === 'short' ? <p className={styles.unitHint}>{editor.shortHelp}</p> : null}
      </div>
      {draft.type === 'numeric' ? (
        <fieldset className={styles.editorGroup}>
          <legend>{editor.types.numeric}</legend>
          <label className={styles.editorInline}>
            <input
              type="checkbox"
              checked={draft.withVariants}
              onChange={(event) => set({ withVariants: event.target.checked })}
            />
            {editor.withVariants}
          </label>
          {draft.withVariants ? (
            <div className={formStyles.field}>
              <label htmlFor={`${ids}-formula`}>{editor.formula}</label>
              <input
                id={`${ids}-formula`}
                type="text"
                value={draft.formula}
                onChange={(event) => set({ formula: event.target.value })}
              />
            </div>
          ) : (
            <div className={formStyles.field}>
              <label htmlFor={`${ids}-valor`}>{editor.value}</label>
              <input
                id={`${ids}-valor`}
                type="text"
                inputMode="decimal"
                value={draft.value}
                onChange={(event) => set({ value: event.target.value })}
              />
            </div>
          )}
          <div className={formStyles.field}>
            <label htmlFor={`${ids}-margen`}>{editor.tolerance}</label>
            <input
              id={`${ids}-margen`}
              type="text"
              inputMode="decimal"
              value={draft.tolerance}
              onChange={(event) => set({ tolerance: event.target.value })}
            />
          </div>
          <div className={formStyles.field}>
            <label htmlFor={`${ids}-unidad`}>{editor.unit}</label>
            <input
              id={`${ids}-unidad`}
              type="text"
              value={draft.unit}
              onChange={(event) => set({ unit: event.target.value })}
            />
          </div>
        </fieldset>
      ) : null}
      {draft.type === 'procedure' ? (
        <>
          <ProcedureEditor
            steps={draft.procedureSteps}
            onChange={(procedureSteps) => set({ procedureSteps })}
          />
          <label className={styles.editorInline}>
            <input
              type="checkbox"
              checked={draft.withVariants}
              onChange={(event) => set({ withVariants: event.target.checked })}
            />
            {editor.withVariants}
          </label>
        </>
      ) : null}
      {draft.withVariants && (draft.type === 'numeric' || draft.type === 'procedure') ? (
        <FamilyEditor family={draft.family} onChange={(family) => set({ family })} />
      ) : null}
      {draft.type === 'decision' ? (
        <DecisionEditor methods={draft.methods} onChange={(methods) => set({ methods })} />
      ) : null}
      {draft.type === 'interleaved' ? (
        <SetEditor types={draft.types} exercises={exercises} onChange={(types) => set({ types })} />
      ) : null}
      {draft.type === 'options' ? (
        <fieldset className={styles.editorGroup}>
          <legend>{editor.optionsLegend}</legend>
          {draft.options.map((option, index) => (
            <div key={option.id} className={styles.editorRow}>
              <div className={formStyles.field}>
                <label htmlFor={`${ids}-opcion-${index}`}>{editor.option(index + 1)}</label>
                <input
                  id={`${ids}-opcion-${index}`}
                  type="text"
                  value={option.text}
                  onChange={(event) =>
                    set({
                      options: draft.options.map((item, at) =>
                        at === index ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <label className={styles.editorInline}>
                <input
                  type="radio"
                  name={`${ids}-correcta`}
                  checked={option.correct}
                  onChange={() =>
                    set({
                      options: draft.options.map((item, at) => ({
                        ...item,
                        correct: at === index,
                      })),
                    })
                  }
                />
                {editor.optionCorrect(index + 1)}
              </label>
              {option.correct ? null : (
                <div className={formStyles.field}>
                  <label htmlFor={`${ids}-por-que-${index}`}>
                    {editor.optionExplanation(index + 1)}
                  </label>
                  <input
                    id={`${ids}-por-que-${index}`}
                    type="text"
                    value={option.explanation}
                    onChange={(event) =>
                      set({
                        options: draft.options.map((item, at) =>
                          at === index ? { ...item, explanation: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </fieldset>
      ) : null}
      {draft.type === 'order' ? (
        <fieldset className={styles.editorGroup}>
          <legend>{editor.stepsLegend}</legend>
          {draft.steps.map((step, index) => (
            <div key={step.id} className={styles.editorInline}>
              <div className={formStyles.field}>
                <label htmlFor={`${ids}-paso-${index}`}>{editor.step(index + 1)}</label>
                <input
                  id={`${ids}-paso-${index}`}
                  type="text"
                  value={step.text}
                  onChange={(event) =>
                    set({
                      steps: draft.steps.map((item, at) =>
                        at === index ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <Boton
                variant="quiet"
                disabled={index === 0}
                onClick={() => {
                  const moved = [...draft.steps];
                  const [item] = moved.splice(index, 1);
                  if (item) {
                    moved.splice(index - 1, 0, item);
                  }
                  set({ steps: moved });
                }}
              >
                {texts.practice.up}
              </Boton>
              <Boton
                variant="quiet"
                disabled={index === draft.steps.length - 1}
                onClick={() => {
                  const moved = [...draft.steps];
                  const [item] = moved.splice(index, 1);
                  if (item) {
                    moved.splice(index + 1, 0, item);
                  }
                  set({ steps: moved });
                }}
              >
                {texts.practice.down}
              </Boton>
              <Boton
                variant="quiet"
                disabled={draft.steps.length <= MIN_STEPS}
                aria-label={editor.removeStep(index + 1)}
                onClick={() => set({ steps: draft.steps.filter((_, at) => at !== index) })}
              >
                {texts.practice.editor.removeStep(index + 1)}
              </Boton>
            </div>
          ))}
          <Boton
            disabled={draft.steps.length >= MAX_STEPS}
            onClick={() => set({ steps: [...draft.steps, { id: newId(), text: '' }] })}
          >
            {editor.addStep}
          </Boton>
        </fieldset>
      ) : null}
      {draft.type === 'open' ? (
        <fieldset className={styles.editorGroup}>
          <legend>{editor.unitsLegend}</legend>
          {draft.units.map((unit, index) => (
            <div key={unit.id} className={styles.editorInline}>
              <div className={formStyles.field}>
                <label htmlFor={`${ids}-unidad-${index}`}>{editor.unitIdea(index + 1)}</label>
                <input
                  id={`${ids}-unidad-${index}`}
                  type="text"
                  value={unit.text}
                  onChange={(event) =>
                    set({
                      units: draft.units.map((item, at) =>
                        at === index ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <Boton
                variant="quiet"
                disabled={draft.units.length <= MIN_UNITS}
                onClick={() => set({ units: draft.units.filter((_, at) => at !== index) })}
              >
                {editor.removeUnit(index + 1)}
              </Boton>
            </div>
          ))}
          <Boton
            disabled={draft.units.length >= MAX_UNITS}
            onClick={() => set({ units: [...draft.units, { id: newId(), text: '' }] })}
          >
            {editor.addUnit}
          </Boton>
        </fieldset>
      ) : null}
    </>
  );
}
