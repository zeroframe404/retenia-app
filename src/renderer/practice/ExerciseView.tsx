import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActivityOpening,
  AmendmentNotice,
  AppealReason,
  AttemptAnswer,
  DiagnosisValue,
  Proposal,
  ResultPartsValue,
  SubmitResult,
  VerdictValue,
} from '../../preload/contract/activities';
import { APPEAL_REASONS } from '../../preload/contract/activities';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { AvisoEvaluacionCorregida, Resultado } from '../ui/Evaluation';
import { ScreenFrame, Toast } from '../ui/Frame';
import { RotuloModo } from '../ui/Labels';
import { MenuAcciones } from '../ui/Menu';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { BarraAyuda } from '../ui/Session';
import { ConfirmSolution, HelpPanel } from './HelpPanel';
import { ChoiceAnswer, LetterDiff, NumberAnswer, OrderAnswer, TextAnswer } from './inputs';
import { actionText, diagnosisText, noticeTexts, reviewText, toneOf, verdictText } from './labels';
import styles from './Practice.module.css';
import { useHelp } from './useHelp';

const VERDICT_ORDER: readonly VerdictValue[] = ['correct', 'partial', 'incorrect'];
const VERDICT_TEXT: Record<VerdictValue, string> = {
  correct: texts.practice.verdicts.correct,
  partial: texts.practice.verdicts.partial,
  incorrect: texts.practice.verdicts.incorrect,
};

// La parte de «Discrepo» que pide editar la ficha: qué parte de la referencia corregir.
export type ReferenceField = 'variants' | 'numeric' | 'options' | 'steps' | 'units';

// «Practicar ahora» sobre un ejercicio (Fase 16, H-31 a H-33): la consigna, la entrada del tipo,
// la barra de ayuda con su panel, «Enviar» y el resultado en tres líneas con «Siguiente»,
// «Explicación», «Reintentar» y «Discrepo». Lo propuesto se puede bajar, nunca subir, hasta salir
// del resultado; ahí se guarda la evaluación.
export function ExerciseView({
  cardId,
  onClose,
  onEditReference,
  onOpenOriginal,
  onOpenObjective,
  onPracticeOther,
  runId,
  onNext,
  studySessionId,
  onSent,
}: {
  cardId: string;
  onClose: () => void;
  // Dentro de la sesión de Estudiar (cuál): lo que se envía queda anotado para ella, se sale con
  // «Pausar» y avisa cuando ya enviaste.
  studySessionId?: string | undefined;
  onSent?: (() => void) | undefined;
  // Fase 18: en un conjunto mezclado, la vuelta y qué hace «Siguiente».
  runId?: string | undefined;
  onNext?: (() => void) | undefined;
  // «La referencia está incompleta»: abrir la ficha en esa parte.
  onEditReference: (field: ReferenceField) => void;
  onOpenOriginal?: ((materialId: string) => void) | undefined;
  // Fase 17: tras un fallo, «Ir al requisito» y «Practicar la diferencia».
  onOpenObjective?: ((objectiveId: string) => void) | undefined;
  onPracticeOther?: ((cardId: string) => void) | undefined;
}) {
  // En la sesión, el ejercicio va justo debajo del título de la pantalla.
  const inSession = studySessionId !== undefined;
  const level = inSession ? 2 : 3;
  const [openingId] = useState(() => crypto.randomUUID());
  const [opening, setOpening] = useState<ActivityOpening | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attemptNo, setAttemptNo] = useState(1);
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [order, setOrder] = useState<{ id: string; text: string }[]>([]);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [verdict, setVerdict] = useState<VerdictValue>('incorrect');
  const [marked, setMarked] = useState<readonly string[]>([]);
  // Después de guardar: ya no se baja; el resultado lo cambia solo «Discrepo».
  const [final, setFinal] = useState<{
    verdict: VerdictValue;
    parts: ResultPartsValue;
    diagnosis?: DiagnosisValue | null | undefined;
  } | null>(null);
  const [notice, setNotice] = useState<AmendmentNotice | null>(null);
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  const busy = useRef(false);
  const textField = useRef<HTMLTextAreaElement>(null);
  const numberField = useRef<HTMLInputElement>(null);
  // La tarjeta quedó «En revisión» por «Discrepo»: no se puede reintentar.
  const [outOfReviews, setOutOfReviews] = useState(false);
  // Al enviar, la corrección queda a la vista (la respuesta modelo y el resultado están abajo).
  const correction = useRef<HTMLDivElement>(null);
  const attemptShown = submitted?.attemptId;
  useEffect(() => {
    if (attemptShown !== undefined) {
      correction.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [attemptShown]);
  const marking = useRef(false);
  const help = useHelp({
    cardId,
    openingId,
    opening,
    attemptNo,
    focusAnswer: () => (textField.current ?? numberField.current)?.focus(),
  });
  const resetHelp = help.reset;

  useEffect(() => {
    let alive = true;
    window.retenia['activities.start']({ cardId, openingId }).then(
      (opened) => {
        if (!alive) {
          return;
        }
        setOpening(opened);
        resetHelp(opened);
        if (opened.input.type === 'order') {
          setOrder(opened.input.steps);
        }
      },
      () => {
        if (alive) {
          setLoadFailed(true);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [cardId, openingId, resetHelp]);

  // Lo último en pantalla, para guardar la evaluación al salir sin tocar «Siguiente»: al cambiar
  // de pantalla y también al cerrar la ventana (el principal espera a que termine).
  const latest = useRef({ submitted, final, verdict, marked });
  latest.current = { submitted, final, verdict, marked };
  const saveOpen = useCallback(async () => {
    const { submitted: open, final: saved, verdict: last, marked: units } = latest.current;
    if (open && !saved) {
      await window.retenia['activities.finalize']({
        attemptId: open.attemptId,
        verdict: last,
        marked: [...units],
      }).catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    const unregister = window.reteniaCierre?.alCerrar(saveOpen);
    return () => {
      unregister?.();
      void saveOpen();
    };
  }, [saveOpen]);

  const started = () => {
    if (!help.started) {
      help.start();
      window.retenia['activities.mark']({ openingId }).catch(() => undefined);
    }
  };

  function answerOf(): AttemptAnswer | null {
    switch (opening?.input.type) {
      case 'short':
        return { type: 'short', text };
      case 'numeric':
        return { type: 'numeric', raw: text };
      case 'open':
        return { type: 'open', text };
      case 'options':
      case 'decision':
        return chosen === null
          ? null
          : {
              type: opening.input.type,
              optionId: chosen,
              shown: opening.input.options.map((option) => option.id),
            };
      case 'order':
        return {
          type: 'order',
          stepIds: order.map((step) => step.id),
          initial: opening.input.steps.map((step) => step.id),
        };
      default:
        return null;
    }
  }

  async function guarded(action: () => Promise<void>) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setProblem('');
    try {
      await action();
    } catch {
      setProblem(texts.practice.failed);
    } finally {
      busy.current = false;
    }
  }

  const submit = () =>
    guarded(async () => {
      const answer = answerOf();
      if (answer === null) {
        return;
      }
      const result = await window.retenia['activities.submit']({
        cardId,
        openingId,
        attemptId: crypto.randomUUID(),
        attemptNo,
        answer,
        help: help.used,
        noIdea: help.noIdea,
        ...(runId === undefined ? {} : { runId }),
        ...(studySessionId === undefined ? {} : { studySessionId }),
      });
      help.hidePanel();
      onSent?.();
      setSubmitted(result);
      setProposal(result);
      setVerdict(result.proposed);
      setMarked([]);
      setFinal(null);
      setNotice(null);
    });

  // Lo que se ve del resultado: lo propuesto (o lo elegido, si se bajó) hasta guardar.
  const refresh = useCallback(
    async (units: readonly string[], chosenVerdict: VerdictValue | undefined) => {
      if (!submitted) {
        return;
      }
      const next = await window.retenia['activities.propose']({
        attemptId: submitted.attemptId,
        marked: [...units],
        ...(chosenVerdict === undefined ? {} : { verdict: chosenVerdict }),
      });
      setProposal(next);
      setVerdict(
        chosenVerdict !== undefined && next.allowed.includes(chosenVerdict)
          ? chosenVerdict
          : next.proposed,
      );
    },
    [submitted],
  );

  async function toggleUnit(unitId: string) {
    if (marking.current || final) {
      return;
    }
    marking.current = true;
    const next = marked.includes(unitId)
      ? marked.filter((id) => id !== unitId)
      : [...marked, unitId];
    setMarked(next);
    try {
      await refresh(next, undefined);
    } catch {
      setProblem(texts.practice.failed);
    } finally {
      marking.current = false;
    }
  }

  async function finalize(): Promise<{ verdict: VerdictValue; parts: ResultPartsValue } | null> {
    if (!submitted) {
      return null;
    }
    if (final) {
      return final;
    }
    const saved = await window.retenia['activities.finalize']({
      attemptId: submitted.attemptId,
      verdict,
      marked: [...marked],
    });
    const done = { verdict: saved.verdict, parts: saved.parts, diagnosis: saved.diagnosis };
    setFinal(done);
    return done;
  }

  const next = () =>
    guarded(async () => {
      await finalize();
      (onNext ?? onClose)();
    });

  const retry = () =>
    guarded(async () => {
      await finalize();
      setAttemptNo((current) => current + 1);
      setSubmitted(null);
      setProposal(null);
      setFinal(null);
      setNotice(null);
      setMarked([]);
      help.hidePanel();
    });

  const appeal = (reason: AppealReason) =>
    guarded(async () => {
      if (!submitted) {
        return;
      }
      const result = await window.retenia['activities.appeal']({
        attemptId: submitted.attemptId,
        reason,
        verdict,
        marked: [...marked],
      });
      if (result.kind === 'editor') {
        if (!final) {
          setFinal({ verdict, parts: proposal?.parts ?? submitted.parts });
        }
        onEditReference(result.field);
        return;
      }
      setFinal({ verdict: result.verdict, parts: result.parts });
      setNotice(result.notice);
      setOutOfReviews(result.notice.inReview);
    });

  const undoAmendment = (current: AmendmentNotice) =>
    guarded(async () => {
      if (!submitted) {
        return;
      }
      const undone = await window.retenia['activities.undoAmendment']({
        amendmentId: current.amendmentId,
      });
      const shown = await window.retenia['activities.propose']({
        attemptId: submitted.attemptId,
        marked: [...marked],
        verdict: undone.verdict,
      });
      setFinal({ verdict: undone.verdict, parts: shown.parts });
      setOutOfReviews(false);
      setNotice(null);
      setToast(texts.practice.amendmentUndone);
    });

  const acknowledge = (current: AmendmentNotice) =>
    guarded(async () => {
      await window.retenia['activities.acknowledge']({ amendmentId: current.amendmentId });
      setNotice(null);
    });

  if (loadFailed) {
    return (
      <ScreenFrame level={level} title={texts.practice.exerciseTitle}>
        <BannerEstado tone="attention">{texts.practice.loadFailed}</BannerEstado>
        {inSession ? null : <Boton onClick={onClose}>{texts.practice.backToCards}</Boton>}
      </ScreenFrame>
    );
  }
  if (opening === null) {
    return (
      <ScreenFrame level={level} title={texts.practice.exerciseTitle}>
        {null}
      </ScreenFrame>
    );
  }

  const input = opening.input;
  const shownParts = final?.parts ?? proposal?.parts ?? null;
  const shownVerdict = final?.verdict ?? verdict;
  const detail = submitted?.detail ?? null;
  const missing = proposal?.missing ?? submitted?.missing ?? [];
  const evaluation = opening.mode === 'evaluation' && attemptNo === 1;
  const canSubmit =
    input.type === 'options' || input.type === 'decision'
      ? chosen !== null
      : input.type === 'order'
        ? true
        : text.trim() !== '';
  const primary = shownParts?.action ?? 'next';
  // Tras un fallo, la tercera línea es el diagnóstico (CA-153): una sola acción con su motivo.
  const diagnosis =
    shownVerdict === 'incorrect'
      ? ((final === null ? proposal?.diagnosis : final.diagnosis) ?? submitted?.diagnosis ?? null)
      : null;

  const diagnosisAction = (() => {
    if (diagnosis?.action === 'goToRequirement' && onOpenObjective) {
      const target = diagnosis.requirement.objectiveId;
      return (
        <Boton
          onClick={() =>
            void guarded(async () => {
              await finalize();
              onOpenObjective(target);
            })
          }
        >
          {texts.practice.diagnosis.goToRequirement}
        </Boton>
      );
    }
    if (diagnosis?.action === 'practiceDifference' && onPracticeOther) {
      const other = diagnosis.confusedWith.cardId;
      return (
        <Boton
          onClick={() =>
            void guarded(async () => {
              await finalize();
              onPracticeOther(other);
            })
          }
        >
          {texts.practice.diagnosis.practiceDifference}
        </Boton>
      );
    }
    if (diagnosis?.action === 'sendToReview' && !outOfReviews) {
      return (
        // Es «La pregunta era ambigua» de «Discrepo»: la tarjeta pasa a «En revisión» y este
        // intento no cuenta (con su aviso y «Deshacer»).
        <Boton onClick={() => void appeal('ambiguous')}>
          {texts.practice.diagnosis.sendToReview}
        </Boton>
      );
    }
    return null;
  })();
  // Un reintento de una evaluación ya es práctica: autónoma hasta la primera ayuda.
  const label = evaluation ? 'evaluation' : help.label === 'evaluation' ? 'autonomous' : help.label;

  return (
    <ScreenFrame level={level} title={texts.practice.exerciseTitle}>
      <Toast>{toast}</Toast>
      <div className={styles.layout} data-panel={help.panel === null ? 'closed' : 'open'}>
        <div className={styles.activity}>
          <div className={styles.bar}>
            <RotuloModo mode={label} />
          </div>
          {evaluation ? (
            <p className={styles.evaluationNotice}>{texts.practice.evaluationNotice}</p>
          ) : null}
          <p className={styles.prompt}>{opening.question}</p>
          {opening.statement === undefined ? null : (
            <p className={styles.statement}>{opening.statement}</p>
          )}
          {input.type === 'short' || input.type === 'open' ? (
            <TextAnswer
              inputRef={textField}
              value={text}
              rows={input.type === 'open' ? 5 : 2}
              readOnly={submitted !== null}
              onChange={(value) => {
                started();
                setText(value);
              }}
            />
          ) : null}
          {input.type === 'numeric' ? (
            <NumberAnswer
              inputRef={numberField}
              value={text}
              unit={input.unit}
              readOnly={submitted !== null}
              onChange={(value) => {
                started();
                setText(value);
              }}
            />
          ) : null}
          {input.type === 'options' ? (
            <ChoiceAnswer
              options={input.options}
              chosen={chosen}
              locked={submitted !== null}
              onChoose={(id) => {
                started();
                setChosen(id);
              }}
            />
          ) : null}
          {input.type === 'decision' ? (
            <ChoiceAnswer
              legend={texts.practice.decision.question}
              options={input.options}
              chosen={chosen}
              locked={submitted !== null}
              onChoose={(id) => {
                started();
                setChosen(id);
              }}
            />
          ) : null}
          {input.type === 'order' ? (
            <OrderAnswer
              steps={detail?.type === 'order' ? detail.given : order}
              marks={detail?.type === 'order' ? detail.given.map((step) => step.ok) : null}
              onMove={(from, to) => {
                started();
                setOrder((current) => {
                  const moved = [...current];
                  const [step] = moved.splice(from, 1);
                  if (step) {
                    moved.splice(to, 0, step);
                  }
                  return moved;
                });
              }}
            />
          ) : null}
          {submitted === null ? (
            <>
              {evaluation ? null : (
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
              )}
              {help.problem === '' ? null : (
                <BannerEstado tone="attention">{help.problem}</BannerEstado>
              )}
              <div className={styles.actions}>
                <Boton variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
                  {texts.practice.submit}
                </Boton>
                {inSession ? null : (
                  <Boton variant="quiet" onClick={onClose}>
                    {texts.practice.backToCards}
                  </Boton>
                )}
              </div>
            </>
          ) : null}
          {submitted !== null && shownParts !== null ? (
            <div ref={correction} className={styles.activity}>
              {detail?.type === 'open' ? (
                <fieldset className={styles.model}>
                  <legend>{texts.practice.modelAnswer}</legend>
                  <p className={styles.unitHint}>{texts.practice.markUnits}</p>
                  {detail.units.map((unit, index) => (
                    <label
                      key={unit.id}
                      className={styles.unitChoice}
                      data-unit={marked.includes(unit.id) ? 'covered' : 'missing'}
                    >
                      <input
                        type="checkbox"
                        checked={marked.includes(unit.id)}
                        disabled={final !== null}
                        aria-label={texts.practice.unitCovered(index + 1)}
                        onChange={() => void toggleUnit(unit.id)}
                      />
                      <span>{unit.text}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {detail?.type === 'short' && shownVerdict !== 'correct' ? (
                <LetterDiff diff={detail.diff} />
              ) : null}
              {detail?.type === 'options' && shownVerdict !== 'correct' ? (
                <p>{texts.practice.correctOption(detail.correctText)}</p>
              ) : null}
              {detail?.type === 'decision' ? (
                <section>
                  <h3 className={styles.diffTitle}>{texts.practice.decision.whyHeading}</h3>
                  <ul className={styles.whys}>
                    {detail.options.map((option) => (
                      <li
                        key={option.id}
                        data-chosen={option.id === detail.chosenId}
                        data-right={option.correct}
                      >
                        <p className={styles.whyName}>
                          <span>{option.text}</span>
                          {option.id === detail.chosenId ? (
                            <span className={styles.whyMark}>{texts.practice.decision.chosen}</span>
                          ) : null}
                          {option.correct ? (
                            <span className={styles.whyMark}>{texts.practice.decision.right}</span>
                          ) : null}
                        </p>
                        <p>{option.why}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {detail?.type === 'order' && shownVerdict !== 'correct' ? (
                <section>
                  <h3 className={styles.diffTitle}>{texts.practice.correctOrder}</h3>
                  <ol className={styles.solutionList}>
                    {detail.correct.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
              <Resultado
                verdict={toneOf(shownVerdict)}
                label={verdictText(shownParts)}
                review={reviewText(shownParts, detail, missing)}
                action={
                  diagnosis === null ? (
                    <p>{actionText(shownParts, null)}</p>
                  ) : (
                    <>
                      <p>{diagnosisText(diagnosis)}</p>
                      {diagnosisAction}
                    </>
                  )
                }
              />
              {final === null && proposal !== null ? (
                <div className={styles.change}>
                  <OptionGroup
                    legend={texts.practice.changeResult}
                    options={VERDICT_ORDER.map((value) => ({
                      value,
                      text: VERDICT_TEXT[value],
                      disabled: !proposal.allowed.includes(value),
                    }))}
                    value={verdict}
                    onChange={(value) => {
                      if (proposal.allowed.includes(value)) {
                        setVerdict(value);
                        void refresh(marked, value).catch(() => setProblem(texts.practice.failed));
                      }
                    }}
                  />
                </div>
              ) : null}
              {notice ? (
                <AvisoEvaluacionCorregida
                  {...noticeTexts(notice)}
                  onUnderstood={() => void acknowledge(notice)}
                  onUndo={() => void undoAmendment(notice)}
                />
              ) : null}
              <div className={styles.resultButtons}>
                <Boton
                  variant={
                    primary === 'next' || primary === 'check' || primary === 'retryLater'
                      ? 'primary'
                      : 'secondary'
                  }
                  onClick={() => void next()}
                >
                  {texts.practice.buttons.next}
                </Boton>
                <Boton
                  variant={primary === 'explanation' ? 'primary' : 'secondary'}
                  onClick={() => help.showExplanation(submitted.explanation)}
                >
                  {texts.practice.buttons.explanation}
                </Boton>
                {outOfReviews ? null : (
                  <Boton
                    variant={primary === 'retry' ? 'primary' : 'secondary'}
                    onClick={() => void retry()}
                  >
                    {texts.practice.buttons.retry}
                  </Boton>
                )}
                <MenuAcciones
                  label={texts.practice.buttons.disagree}
                  items={APPEAL_REASONS.map((reason) => ({
                    key: reason,
                    text: texts.practice.reasons[reason],
                    onSelect: () => void appeal(reason),
                  }))}
                />
              </div>
            </div>
          ) : null}
          {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        </div>
        <HelpPanel help={help} onOpenOriginal={onOpenOriginal} />
      </div>
      <ConfirmSolution help={help} />
    </ScreenFrame>
  );
}
