import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  type ActivityOpening,
  type AmendmentNotice,
  APPEAL_REASONS,
  type AppealReason,
} from '../../preload/contract/activities';
import type {
  CorrectionValue,
  LadderValue,
  MicroProposal,
  ProcedureResult,
  RungValue,
  ProcedureView as View,
} from '../../preload/contract/procedures';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { AvisoEvaluacionCorregida, Resultado } from '../ui/Evaluation';
import { ScreenFrame, Toast } from '../ui/Frame';
import { RotuloModo } from '../ui/Labels';
import { MenuAcciones } from '../ui/Menu';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { BarraAyuda } from '../ui/Session';
import { ViewState } from '../ui/ViewStates';
import type { ReferenceField } from './ExerciseView';
import { ConfirmSolution, HelpPanel } from './HelpPanel';
import { diagnosisText, noticeTexts, toneOf } from './labels';
import { MicroExerciseView, MicroProposalCard } from './MicroExercise';
import styles from './Practice.module.css';
import { useHelp } from './useHelp';

// «Practicar ahora» sobre un procedimiento (Fase 18, H-37): el ejemplo completo con «¿Por qué este
// paso?», o los pasos vacíos de tu escalón de apoyo. Con un error, primero dice en qué paso está y
// deja reintentarlo; después, la corrección y cómo viene la próxima vez.

const text = texts.practice.procedure;

function rungName(rung: RungValue): string {
  return rung.kind === 'blanks' ? text.rungNames.blanks(rung.blanks) : text.rungNames[rung.kind];
}

// Qué hay que completar, según los pasos que de verdad vienen vacíos (uno de antes puede volver
// después de un micro-ejercicio). Solo se habla de «una variante» si los números cambian.
export function introOf(view: {
  statement: string;
  rung: RungValue;
  steps: readonly { blank: boolean }[];
}): string {
  if (view.rung.kind === 'example') {
    return text.exampleIntro;
  }
  const count = view.steps.filter((step) => step.blank).length;
  if (count === view.steps.length) {
    return view.rung.kind === 'variant' && view.statement !== ''
      ? text.variantIntro
      : text.wholeIntro;
  }
  const theLast = view.steps.slice(view.steps.length - count).every((step) => step.blank);
  return theLast ? text.blanksIntro(count) : text.someBlanksIntro;
}

// Por qué cambió el apoyo, o por qué no (CA-158).
function LadderNotes({ ladder }: { ladder: LadderValue }) {
  return (
    <>
      {ladder.change === 'less' ? <p>{text.lessSupport}</p> : null}
      {ladder.change === 'more' ? <p>{text.moreSupport}</p> : null}
      {ladder.counted ? null : <p>{text.notCounted}</p>}
    </>
  );
}

// Lo que cambia la próxima vez (CA-158, CA-159).
function LadderLines({ ladder }: { ladder: LadderValue }) {
  return (
    <>
      <p>{text.next(rungName(ladder.next))}</p>
      <LadderNotes ladder={ladder} />
    </>
  );
}

interface Tally {
  studied: number;
  solved: number;
}

// La práctica de un procedimiento: «Otro problema» abre uno nuevo y «Terminar» lleva al cierre.
export function ProcedureView({
  cardId,
  onClose,
  onEditReference,
  onOpenObjective,
}: {
  cardId: string;
  onClose: () => void;
  // «La referencia está incompleta»: abrir la ficha en sus pasos.
  onEditReference: (field: ReferenceField) => void;
  onOpenObjective?: ((objectiveId: string) => void) | undefined;
}) {
  const [openingId, setOpeningId] = useState(() => crypto.randomUUID());
  const [closing, setClosing] = useState(false);
  const [micro, setMicro] = useState<MicroProposal | null>(null);
  const tally = useRef<Tally>({ studied: 0, solved: 0 });

  if (micro !== null) {
    return <MicroExerciseView proposal={micro} onDone={() => setMicro(null)} />;
  }
  if (closing) {
    return (
      <ScreenFrame level={3} title={text.closingTitle}>
        {tally.current.studied > 0 ? <p>{text.closingStudied}</p> : null}
        {tally.current.solved > 0 ? <p>{text.closingSolved(tally.current.solved)}</p> : null}
        <MicroProposalCard onStart={setMicro} />
        <div className={styles.actions}>
          <Boton variant="primary" onClick={onClose}>
            {texts.practice.backToCards}
          </Boton>
        </div>
      </ScreenFrame>
    );
  }
  return (
    <ProcedureRun
      key={openingId}
      cardId={cardId}
      openingId={openingId}
      onClose={onClose}
      onEditReference={onEditReference}
      onOpenObjective={onOpenObjective}
      onDone={(kind, next) => {
        tally.current[kind] += 1;
        if (next === 'another') {
          setOpeningId(crypto.randomUUID());
        } else {
          setClosing(true);
        }
      }}
    />
  );
}

function ProcedureRun({
  cardId,
  openingId,
  onClose,
  onEditReference,
  onOpenObjective,
  onDone,
}: {
  cardId: string;
  openingId: string;
  onClose: () => void;
  onEditReference: (field: ReferenceField) => void;
  onOpenObjective?: ((objectiveId: string) => void) | undefined;
  onDone: (kind: keyof Tally, next: 'another' | 'finish') => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [opening, setOpening] = useState<ActivityOpening | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const [studied, setStudied] = useState<LadderValue | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<{ stepId: string; position: number } | null>(null);
  const [retryText, setRetryText] = useState('');
  const [retryNotice, setRetryNotice] = useState('');
  const [correction, setCorrection] = useState<CorrectionValue | null>(null);
  const [matches, setMatches] = useState<Record<string, 'yes' | 'no'>>({});
  const [result, setResult] = useState<ProcedureResult | null>(null);
  const [problem, setProblem] = useState('');
  // «Discrepo» sobre el resultado: el aviso abierto y si la tarjeta quedó «En revisión».
  const [notice, setNotice] = useState<AmendmentNotice | null>(null);
  const [appealed, setAppealed] = useState(false);
  const [outOfReviews, setOutOfReviews] = useState(false);
  const [toast, setToast] = useState('');
  const busy = useRef(false);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const retryField = useRef<HTMLInputElement>(null);
  const after = useRef<HTMLDivElement>(null);
  const attemptRequest = useRef(crypto.randomUUID());
  const ids = useId();
  const help = useHelp({
    cardId,
    openingId,
    opening,
    attemptNo: 1,
    focusAnswer: () => firstField.current?.focus(),
  });
  const resetHelp = help.reset;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const opened = await window.retenia['activities.start']({ cardId, openingId });
      const loaded = await window.retenia['procedure.open']({ cardId, openingId });
      if (alive) {
        setOpening(opened);
        resetHelp(opened);
        setView(loaded);
      }
    };
    load().catch(() => {
      if (alive) {
        setLoadFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [cardId, openingId, resetHelp]);

  const errorStep = error?.stepId;
  useEffect(() => {
    if (errorStep !== undefined) {
      retryField.current?.focus();
    }
  }, [errorStep]);
  const shownAfter = correction !== null || result !== null || studied !== null;
  useEffect(() => {
    if (shownAfter) {
      after.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [shownAfter]);

  const guarded = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setProblem('');
    try {
      await action();
    } catch {
      setProblem(texts.practice.procedure.failed);
    } finally {
      busy.current = false;
    }
  }, []);

  if (loadFailed) {
    return (
      <ScreenFrame level={3} title={texts.practice.exerciseTitle}>
        <BannerEstado tone="attention">{text.loadFailed}</BannerEstado>
        <Boton onClick={onClose}>{texts.practice.backToCards}</Boton>
      </ScreenFrame>
    );
  }
  if (view === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }

  const example = view.rung.kind === 'example';
  const blanks = view.steps.filter((step) => step.blank);
  const keySteps = view.steps.filter((step) => step.key);
  const started = () => {
    if (!help.started) {
      help.start();
      window.retenia['activities.mark']({ openingId }).catch(() => undefined);
    }
  };
  const sent = attemptId !== null;
  const canSubmit = blanks.every((step) => (answers[step.id] ?? '').trim() !== '');
  const canFinishExample = keySteps.every((step) => (why[step.id] ?? '').trim() !== '');
  const textBlanks = correction?.steps.filter((step) => step.state === 'self') ?? [];
  const assessed = textBlanks.every((step) => matches[step.id] !== undefined);

  const finishExample = () =>
    guarded(async () => {
      const response = await window.retenia['procedure.studied']({
        cardId,
        openingId,
        why: keySteps.map((step) => ({ stepId: step.id, text: (why[step.id] ?? '').trim() })),
      });
      setStudied(response.ladder);
    });

  const submit = () =>
    guarded(async () => {
      const response = await window.retenia['procedure.check']({
        cardId,
        openingId,
        attemptId: attemptRequest.current,
        answers: blanks.map((step) => ({ stepId: step.id, written: answers[step.id] ?? '' })),
        help: help.used,
        noIdea: help.noIdea,
      });
      help.hidePanel();
      if (response.kind === 'error') {
        setAttemptId(response.attemptId);
        setError(response.step);
        return;
      }
      setAttemptId(response.correction.attemptId);
      setCorrection(response.correction);
    });

  const retry = () =>
    guarded(async () => {
      if (attemptId === null || error === null || retryText.trim() === '') {
        return;
      }
      const response = await window.retenia['procedure.retry']({
        attemptId,
        stepId: error.stepId,
        retryId: crypto.randomUUID(),
        written: retryText,
      });
      if (!response.ok) {
        setRetryNotice(text.retryStill(error.position));
        return;
      }
      setRetryNotice(text.retryFixed(error.position));
      setRetryText('');
      setError(response.next);
    });

  const showCorrection = () =>
    guarded(async () => {
      if (attemptId !== null) {
        setCorrection(await window.retenia['procedure.correction']({ attemptId }));
        setError(null);
        setRetryNotice('');
      }
    });

  // Guarda lo que falte (o relee el resultado, si ya estaba guardado).
  const finishNow = async (id: string) => {
    setResult(
      await window.retenia['procedure.finish']({
        attemptId: id,
        self: textBlanks.map((step) => ({ stepId: step.id, ok: matches[step.id] === 'yes' })),
      }),
    );
  };

  const showResult = () =>
    guarded(async () => {
      if (attemptId !== null) {
        await finishNow(attemptId);
      }
    });

  const appeal = (reason: AppealReason) =>
    guarded(async () => {
      if (attemptId === null || result === null) {
        return;
      }
      const response = await window.retenia['activities.appeal']({
        attemptId,
        reason,
        verdict: result.verdict,
        marked: [],
      });
      if (response.kind === 'editor') {
        onEditReference(response.field);
        return;
      }
      setNotice(response.notice);
      setAppealed(true);
      setOutOfReviews(response.notice.inReview);
      await finishNow(attemptId);
    });

  const undoAmendment = (current: AmendmentNotice) =>
    guarded(async () => {
      if (attemptId === null) {
        return;
      }
      await window.retenia['activities.undoAmendment']({ amendmentId: current.amendmentId });
      setNotice(null);
      setAppealed(false);
      setOutOfReviews(false);
      setToast(texts.practice.amendmentUndone);
      await finishNow(attemptId);
    });

  const acknowledge = (current: AmendmentNotice) =>
    guarded(async () => {
      await window.retenia['activities.acknowledge']({ amendmentId: current.amendmentId });
      setNotice(null);
    });

  // «Otro problema» solo si hay otros números para practicar y la tarjeta sigue en los repasos.
  const footer = (kind: keyof Tally) => (
    <div className={styles.resultButtons}>
      <Boton variant="primary" onClick={() => onDone(kind, 'finish')}>
        {text.finish}
      </Boton>
      {view.statement === '' || outOfReviews ? null : (
        <Boton onClick={() => onDone(kind, 'another')}>{text.another}</Boton>
      )}
      {kind === 'solved' ? (
        <MenuAcciones
          label={texts.practice.buttons.disagree}
          items={APPEAL_REASONS.map((reason) => ({
            key: reason,
            text: texts.practice.reasons[reason],
            onSelect: () => void appeal(reason),
          }))}
        />
      ) : null}
    </div>
  );

  const failedAt = result?.steps.find((step) => step.state !== 'ok')?.position ?? null;
  const label = view.rung.kind === 'blanks' || example ? 'help' : help.label;
  // Tras un fallo, la tercera línea es el diagnóstico (CA-153): una sola acción con su motivo.
  const diagnosis =
    result !== null && result.verdict === 'incorrect' && !appealed ? result.diagnosis : null;
  const diagnosisAction = (() => {
    if (diagnosis?.action === 'goToRequirement' && onOpenObjective) {
      const target = diagnosis.requirement.objectiveId;
      return (
        <Boton onClick={() => onOpenObjective(target)}>
          {texts.practice.diagnosis.goToRequirement}
        </Boton>
      );
    }
    if (diagnosis?.action === 'sendToReview' && !outOfReviews) {
      return (
        <Boton onClick={() => void appeal('ambiguous')}>
          {texts.practice.diagnosis.sendToReview}
        </Boton>
      );
    }
    return null;
  })();

  return (
    <ScreenFrame level={3} title={texts.practice.exerciseTitle}>
      <Toast>{toast}</Toast>
      <div className={styles.layout} data-panel={help.panel === null ? 'closed' : 'open'}>
        <div className={styles.activity}>
          <div className={styles.bar}>
            <RotuloModo mode={label === 'evaluation' ? 'autonomous' : label} />
          </div>
          <p className={styles.prompt}>{view.title}</p>
          {view.statement === '' ? null : <p className={styles.statement}>{view.statement}</p>}
          {example ? <h3 className={styles.diffTitle}>{text.exampleHeading}</h3> : null}
          <p>{introOf(view)}</p>
          <ol className={styles.procedure} aria-label={text.stepsLabel}>
            {view.steps.map((step) => (
              <li key={step.id} className={styles.procedureStep} data-blank={step.blank}>
                <p className={styles.procedureHead}>
                  <span className={styles.position}>{text.step(step.position)}</span>{' '}
                  <span>{step.prompt}</span>
                </p>
                {step.solved === null ? null : (
                  <>
                    <p className={styles.stepResult}>{text.result(step.solved.result)}</p>
                    <p>{step.solved.explanation}</p>
                  </>
                )}
                {example && step.key ? (
                  <div className={styles.field}>
                    <label htmlFor={`${ids}-why-${step.id}`}>{text.why}</label>
                    {view.previousWhy
                      .filter((item) => item.stepId === step.id)
                      .map((item) => (
                        <p key={item.stepId} className={styles.unitHint}>
                          {text.previousWhy(item.answer)}
                        </p>
                      ))}
                    <textarea
                      id={`${ids}-why-${step.id}`}
                      className={styles.textarea}
                      rows={2}
                      value={why[step.id] ?? ''}
                      readOnly={studied !== null}
                      aria-describedby={`${ids}-why-help-${step.id}`}
                      onChange={(event) =>
                        setWhy((current) => ({ ...current, [step.id]: event.target.value }))
                      }
                    />
                    <span id={`${ids}-why-help-${step.id}`} className={styles.unitHint}>
                      {text.whyHelp}
                    </span>
                  </div>
                ) : null}
                {step.blank ? (
                  <div className={styles.field}>
                    <label htmlFor={`${ids}-paso-${step.id}`}>
                      {step.answerType === 'number'
                        ? text.numberAnswer(step.position)
                        : text.textAnswer(step.position)}
                    </label>
                    {step.answerType === 'number' ? (
                      <input
                        ref={(node) => {
                          if (step.id === blanks[0]?.id) {
                            firstField.current = node;
                          }
                        }}
                        id={`${ids}-paso-${step.id}`}
                        className={styles.input}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={answers[step.id] ?? ''}
                        readOnly={sent}
                        onChange={(event) => {
                          started();
                          setAnswers((current) => ({ ...current, [step.id]: event.target.value }));
                        }}
                      />
                    ) : (
                      <textarea
                        ref={(node) => {
                          if (step.id === blanks[0]?.id) {
                            firstField.current = node;
                          }
                        }}
                        id={`${ids}-paso-${step.id}`}
                        className={styles.textarea}
                        rows={2}
                        value={answers[step.id] ?? ''}
                        readOnly={sent}
                        onChange={(event) => {
                          started();
                          setAnswers((current) => ({ ...current, [step.id]: event.target.value }));
                        }}
                      />
                    )}
                    {step.unit === null ? null : (
                      <span className={styles.unitHint}>{texts.practice.inUnit(step.unit)}</span>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>

          {example && studied === null ? (
            <div className={styles.actions}>
              <Boton
                variant="primary"
                disabled={!canFinishExample}
                onClick={() => void finishExample()}
              >
                {text.finishExample}
              </Boton>
              <Boton variant="quiet" onClick={onClose}>
                {texts.practice.backToCards}
              </Boton>
            </div>
          ) : null}
          {studied === null ? null : (
            <div ref={after} className={styles.activity}>
              <div role="status">
                <LadderLines ladder={studied} />
              </div>
              {footer('studied')}
            </div>
          )}

          {!example && !sent ? (
            <>
              <BarraAyuda
                tutor={false}
                noIdea={help.availability.noIdea}
                hintDisabled={!help.availability.hint}
                exampleDisabled={!help.availability.example}
                sourceDisabled={!help.availability.source}
                example={help.offers.example}
                source={help.offers.source}
                onHint={help.hint}
                onExample={help.example}
                onSource={help.source}
                onNoIdea={() => {
                  started();
                  help.chooseNoIdea();
                }}
              />
              {help.problem === '' ? null : (
                <BannerEstado tone="attention">{help.problem}</BannerEstado>
              )}
              <div className={styles.actions}>
                <Boton variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
                  {texts.practice.submit}
                </Boton>
                <Boton variant="quiet" onClick={onClose}>
                  {texts.practice.backToCards}
                </Boton>
              </div>
            </>
          ) : null}

          {sent && correction === null ? (
            <div className={styles.activity}>
              {error === null ? null : (
                <>
                  <p className={styles.errorFound} role="status">
                    {text.errorFound(error.position)}
                  </p>
                  <form
                    className={styles.field}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void retry();
                    }}
                  >
                    <label htmlFor={`${ids}-reintento`}>{text.retryAnswer(error.position)}</label>
                    <input
                      ref={retryField}
                      id={`${ids}-reintento`}
                      className={styles.input}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={retryText}
                      onChange={(event) => setRetryText(event.target.value)}
                    />
                    <div className={styles.actions}>
                      <Boton type="submit" variant="primary" disabled={retryText.trim() === ''}>
                        {text.retry(error.position)}
                      </Boton>
                    </div>
                  </form>
                </>
              )}
              {retryNotice === '' ? null : <p role="status">{retryNotice}</p>}
              <div className={styles.actions}>
                <Boton
                  variant={error === null ? 'primary' : 'secondary'}
                  onClick={() => void showCorrection()}
                >
                  {text.seeCorrection}
                </Boton>
              </div>
            </div>
          ) : null}

          {correction === null ? null : (
            <div ref={result === null ? after : undefined} className={styles.activity}>
              <h3 className={styles.diffTitle}>{text.correctionHeading}</h3>
              <ol className={styles.procedure} aria-label={text.correctionHeading}>
                {correction.steps.map((step) => (
                  <li key={step.id} className={styles.procedureStep} data-state={step.state}>
                    <p className={styles.procedureHead}>
                      <span className={styles.position}>{text.step(step.position)}</span>{' '}
                      <span>{step.prompt}</span>
                    </p>
                    <p>{text.yourAnswer(step.written)}</p>
                    {step.retried === null ? null : <p>{text.yourRetry(step.retried)}</p>}
                    {step.state === 'self' ? (
                      <>
                        <p className={styles.stepResult}>{text.modelStep(step.expected)}</p>
                        <p>{step.explanation}</p>
                        <OptionGroup
                          legend={text.selfLegend(step.position)}
                          options={[
                            {
                              value: 'yes' as const,
                              text: text.selfYes,
                              disabled: result !== null,
                            },
                            { value: 'no' as const, text: text.selfNo, disabled: result !== null },
                          ]}
                          value={matches[step.id] ?? null}
                          onChange={(value) =>
                            setMatches((current) => ({ ...current, [step.id]: value }))
                          }
                        />
                      </>
                    ) : (
                      <>
                        <p className={styles.stateLine}>{text.states[step.state]}</p>
                        <p className={styles.stepResult}>{text.expected(step.expected)}</p>
                        <p>{step.explanation}</p>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              {result === null ? (
                <div className={styles.actions}>
                  <Boton variant="primary" disabled={!assessed} onClick={() => void showResult()}>
                    {text.seeResult}
                  </Boton>
                </div>
              ) : null}
            </div>
          )}

          {result === null ? null : (
            <div ref={after} className={styles.activity}>
              <Resultado
                verdict={toneOf(result.verdict)}
                label={texts.practice.verdicts[result.verdict]}
                review={
                  result.verdict === 'correct' || failedAt === null
                    ? text.review.correct
                    : text.review[result.verdict](failedAt)
                }
                action={
                  diagnosis === null ? (
                    <p>{text.next(rungName(result.ladder.next))}</p>
                  ) : (
                    <>
                      <p>{diagnosisText(diagnosis)}</p>
                      {diagnosisAction}
                    </>
                  )
                }
              />
              <div role="status">
                {diagnosis === null ? null : <p>{text.next(rungName(result.ladder.next))}</p>}
                {appealed ? null : <LadderNotes ladder={result.ladder} />}
              </div>
              {notice === null ? null : (
                <AvisoEvaluacionCorregida
                  {...noticeTexts(notice)}
                  onUnderstood={() => void acknowledge(notice)}
                  onUndo={() => void undoAmendment(notice)}
                />
              )}
              {footer('solved')}
            </div>
          )}
          {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        </div>
        <HelpPanel help={help} />
      </div>
      <ConfirmSolution help={help} />
    </ScreenFrame>
  );
}
