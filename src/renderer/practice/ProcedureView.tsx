import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ActivityOpening } from '../../preload/contract/activities';
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
import { Resultado } from '../ui/Evaluation';
import { ScreenFrame } from '../ui/Frame';
import { RotuloModo } from '../ui/Labels';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { BarraAyuda } from '../ui/Session';
import { ViewState } from '../ui/ViewStates';
import { ConfirmSolution, HelpPanel } from './HelpPanel';
import { toneOf } from './labels';
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

function introOf(rung: RungValue): string {
  switch (rung.kind) {
    case 'example':
      return text.exampleIntro;
    case 'blanks':
      return text.blanksIntro(rung.blanks);
    case 'whole':
      return text.wholeIntro;
    case 'variant':
      return text.variantIntro;
  }
}

// Lo que cambia la próxima vez (CA-158, CA-159).
function LadderLines({ ladder }: { ladder: LadderValue }) {
  return (
    <>
      <p>{text.next(rungName(ladder.next))}</p>
      {ladder.change === 'less' ? <p>{text.lessSupport}</p> : null}
      {ladder.change === 'more' ? <p>{text.moreSupport}</p> : null}
      {ladder.counted ? null : <p>{text.notCounted}</p>}
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
  onOpenOriginal,
}: {
  cardId: string;
  onClose: () => void;
  onOpenOriginal?: ((materialId: string) => void) | undefined;
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
      onOpenOriginal={onOpenOriginal}
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
  onOpenOriginal,
  onDone,
}: {
  cardId: string;
  openingId: string;
  onClose: () => void;
  onOpenOriginal?: ((materialId: string) => void) | undefined;
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

  const showResult = () =>
    guarded(async () => {
      if (attemptId !== null) {
        setResult(
          await window.retenia['procedure.finish']({
            attemptId,
            self: textBlanks.map((step) => ({ stepId: step.id, ok: matches[step.id] === 'yes' })),
          }),
        );
      }
    });

  const footer = (kind: keyof Tally) => (
    <div className={styles.resultButtons}>
      <Boton variant="primary" onClick={() => onDone(kind, 'finish')}>
        {text.finish}
      </Boton>
      <Boton onClick={() => onDone(kind, 'another')}>{text.another}</Boton>
    </div>
  );

  const failedAt = result?.steps.find((step) => step.state !== 'ok')?.position ?? null;
  const label = view.rung.kind === 'blanks' || example ? 'help' : help.label;

  return (
    <ScreenFrame level={3} title={texts.practice.exerciseTitle}>
      <div className={styles.layout} data-panel={help.panel === null ? 'closed' : 'open'}>
        <div className={styles.activity}>
          <div className={styles.bar}>
            <RotuloModo mode={label === 'evaluation' ? 'autonomous' : label} />
          </div>
          <p className={styles.prompt}>{view.title}</p>
          {view.statement === '' ? null : <p className={styles.statement}>{view.statement}</p>}
          {example ? <h3 className={styles.diffTitle}>{text.exampleHeading}</h3> : null}
          <p>{introOf(view.rung)}</p>
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
                action={<LadderLines ladder={result.ladder} />}
              />
              {footer('solved')}
            </div>
          )}
          {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        </div>
        <HelpPanel help={help} onOpenOriginal={onOpenOriginal} />
      </div>
      <ConfirmSolution help={help} />
    </ScreenFrame>
  );
}
