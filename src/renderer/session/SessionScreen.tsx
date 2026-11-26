import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityOpening } from '../../preload/contract/activities';
import type { CardDetail } from '../../preload/contract/cards';
import { DRAFT_SAVE_MS, MAX_ANSWER_LENGTH, type SessionView } from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { CardFace } from '../cards/CardFace';
import { CardPath } from '../cards/CardPath';
import { SheetForm } from '../cards/SheetForm';
import { Autosaver } from '../notes/editor/autosave';
import { ExerciseView, type ReferenceField } from '../practice/ExerciseView';
import { ConfirmSolution, HelpPanel } from '../practice/HelpPanel';
import practiceStyles from '../practice/Practice.module.css';
import { SessionProcedure } from '../practice/ProcedureView';
import { useHelp } from '../practice/useHelp';
import { landOnReviews } from '../progress/landing';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import { type DraftState, IndicadorBorrador, RotuloModo } from '../ui/Labels';
import { MenuAcciones } from '../ui/Menu';
import { BannerEstado } from '../ui/Process';
import { BarraAyuda } from '../ui/Session';
import { sessionKeyAction } from './keys';
import styles from './Session.module.css';
import { SessionClosing } from './SessionClosing';

type Grade = 'again' | 'hard' | 'good';

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: texts.cards.gradeAgain },
  { grade: 'hard', label: texts.cards.gradeHard },
  { grade: 'good', label: texts.cards.gradeGood },
];
const GRADE_LABEL: Record<Grade, string> = {
  again: texts.cards.gradeAgain,
  hard: texts.cards.gradeHard,
  good: texts.cards.gradeGood,
};

// La sesión de estudio (Fase 10): ocupa la ventana entera, sin el riel. Arriba, «PRÁCTICA
// AUTÓNOMA», el progreso, «Más» y «Pausar»; en el medio, la pregunta con su camino de contexto y el
// campo opcional «Tu respuesta…»; abajo, «Mostrar respuesta». Recién después aparecen la respuesta
// (al lado de lo que escribiste) y los tres botones para calificar. Cada vez que se muestra una
// tarjeta se genera el identificador del intento: un doble clic o un pedido repetido no duplican.
// Teclas: Espacio muestra, 1, 2 y 3 califican, Esc pausa y Ctrl+Z deshace la última calificación.
// Desde la Fase 18 también vuelven los ejercicios: se contestan acá mismo, con su corrección, y
// «Siguiente» sigue con la sesión. Un ejercicio enviado no se deshace (para eso están «Cambiar
// resultado» y «Discrepo»).
export function SessionScreen({
  initial,
  onExit,
  onToast,
  onOpenOriginal,
}: {
  initial: SessionView;
  onExit: () => void;
  onToast: (text: string) => void;
  // «Ver en el original» de la tarjeta (Fase 13): se abre en el panel de la derecha, sin salir.
  onOpenOriginal?: ((target: { materialId: string; cardId: string }) => void) | undefined;
}) {
  const [view, setView] = useState<SessionView>(initial);
  const sessionId = view.sessionId;
  const [attempt, setAttempt] = useState(() => ({
    activityId: initial.current?.activityId ?? null,
    attemptId: crypto.randomUUID(),
  }));
  const [answerShown, setAnswerShown] = useState(initial.current?.draft.answerShown ?? false);
  const [text, setText] = useState(initial.current?.draft.text ?? '');
  const [draft, setDraft] = useState<DraftState | null>(
    (initial.current?.draft.text ?? '') === '' ? null : 'draft',
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [editing, setEditing] = useState<{ card: CardDetail; focus?: ReferenceField } | null>(null);
  // El ejercicio que ya enviaste (por su actividad): desde ahí no hay «Deshacer».
  const [sentActivity, setSentActivity] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState(initial.showShortcuts);
  const inFlight = useRef(false);
  const interacted = useRef(false);
  const question = useRef<HTMLElement>(null);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const answer = useRef<HTMLElement>(null);
  const current = view.current;
  // Si la tarjeta salió de un material, después de mostrar la respuesta se puede ver el original
  // (antes no: la cita puede decir la respuesta).
  const [citedMaterial, setCitedMaterial] = useState<string | null>(null);
  // «El origen cambió»: el texto del material se corrigió y esta tarjeta no se actualizó.
  const [sourceChanged, setSourceChanged] = useState(false);
  const exercise = current !== null && current.card.activityType !== null;
  const exerciseSent = exercise && sentActivity === current.activityId;
  // La tarjeta de siempre: un ejercicio trae su propia ayuda y su propia apertura.
  const cardId = current && !exercise ? current.cardId : null;
  // La barra de ayuda (Fase 16, H-32): cada tarjeta que aparece abre su apertura, y la ayuda que se
  // usa viaja con la calificación. La solución vista (A4) es «Mostrar respuesta».
  const [opening, setOpening] = useState<ActivityOpening | null>(null);
  const showAnswerRef = useRef<() => void>(() => undefined);
  const help = useHelp({
    cardId,
    openingId: attempt.attemptId,
    opening,
    attemptNo: 1,
    onSolution: () => showAnswerRef.current(),
    focusAnswer: () => answerField.current?.focus(),
  });
  const resetHelp = help.reset;
  useEffect(() => {
    setOpening(null);
    resetHelp(null);
    if (cardId === null) {
      return;
    }
    let alive = true;
    window.retenia['activities.start']({ cardId, openingId: attempt.attemptId })
      .then((opened) => {
        if (alive) {
          setOpening(opened);
          // Una sesión retomada con algo escrito ya tiene el intento empezado.
          resetHelp(opened, latest.current.text.trim() !== '');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cardId, attempt.attemptId, resetHelp]);
  useEffect(() => {
    setCitedMaterial(null);
    setSourceChanged(false);
    if (!answerShown || cardId === null || !onOpenOriginal) {
      return;
    }
    let alive = true;
    window.retenia['cards.get']({ cardId })
      .then((card) => {
        if (alive) {
          setCitedMaterial(card.cite?.materialId ?? null);
          setSourceChanged(card.cite?.changed === true);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [answerShown, cardId, onOpenOriginal]);

  // Lo que guarda el borrador: siempre lo último que hay en pantalla.
  const latest = useRef({ sessionId, activityId: current?.activityId ?? '', text, answerShown });
  latest.current = { sessionId, activityId: current?.activityId ?? '', text, answerShown };
  const [autosaver] = useState(
    () =>
      new Autosaver({
        delay: DRAFT_SAVE_MS,
        maxWait: DRAFT_SAVE_MS,
        save: () => {
          const { activityId, ...rest } = latest.current;
          if (activityId === '') {
            return Promise.resolve();
          }
          return window.retenia['study.saveDraft']({ ...rest, activityId });
        },
        onStatus: (status) => {
          if (status === 'saving') {
            setDraft('saving');
          } else if (status === 'saved') {
            setDraft(latest.current.text === '' ? null : 'draft');
          }
        },
        onSaved: () => undefined,
      }),
  );

  // Al cerrar la ventana se guarda lo escrito (el principal pausa la sesión).
  useEffect(() => {
    const unregister = window.reteniaCierre?.alCerrar(async () => {
      await autosaver.flush();
    });
    return () => {
      unregister?.();
      void autosaver.flush();
    };
  }, [autosaver]);

  const mark = useCallback(
    (activityId: string, kind: 'shown' | 'firstInteraction' | 'answerRequested') => {
      window.retenia['study.mark']({ sessionId, activityId, mark: kind }).catch(() => undefined);
    },
    [sessionId],
  );

  // Cada tarjeta que aparece: se anota cuándo se mostró y el foco pasa a la pregunta (así Espacio
  // la muestra y no escribe en el campo).
  useEffect(() => {
    if (attempt.activityId === null) {
      return;
    }
    mark(attempt.activityId, 'shown');
    interacted.current = false;
    question.current?.focus();
  }, [attempt, mark]);

  // Lo que devolvió el principal: si cambió la tarjeta (o se deshizo una calificación), es un
  // intento nuevo, con su identificador nuevo y su borrador.
  const present = useCallback((next: SessionView, force: boolean) => {
    setView(next);
    const now = next.current;
    if (!now) {
      return;
    }
    setAttempt((before) =>
      force || before.activityId !== now.activityId
        ? { activityId: now.activityId, attemptId: crypto.randomUUID() }
        : before,
    );
    if (force || now.activityId !== latest.current.activityId) {
      setAnswerShown(now.draft.answerShown);
      setText(now.draft.text);
      setDraft(now.draft.text === '' ? null : 'draft');
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<SessionView>, force = false) => {
      if (inFlight.current) {
        return false;
      }
      inFlight.current = true;
      setBusy(true);
      setFailed('');
      try {
        await autosaver.flush();
        present(await action(), force);
        return true;
      } catch {
        setFailed(texts.study.actionFailed);
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [autosaver, present],
  );

  const showAnswer = useCallback(() => {
    if (!current || answerShown || current.card.activityType !== null) {
      return;
    }
    setAnswerShown(true);
    latest.current = { ...latest.current, answerShown: true };
    mark(current.activityId, 'answerRequested');
    autosaver.touch();
    void autosaver.flush();
  }, [answerShown, autosaver, current, mark]);
  showAnswerRef.current = showAnswer;

  // Después de mostrarla, el foco pasa a la respuesta: los números califican y Espacio no aprieta
  // ningún botón.
  useEffect(() => {
    if (answerShown) {
      answer.current?.focus();
    }
  }, [answerShown]);

  const grade = useCallback(
    (value: Grade) => {
      if (!current || !answerShown) {
        return;
      }
      void run(() =>
        window.retenia['study.grade']({
          sessionId,
          activityId: current.activityId,
          attemptId: attempt.attemptId,
          grade: value,
          answer: text.trim() === '' ? null : text,
          help: help.used,
          noIdea: help.noIdea,
        }),
      );
    },
    [answerShown, attempt.attemptId, current, run, sessionId, text, help.used, help.noIdea],
  );

  const undo = useCallback(() => {
    const last = view.undoable;
    if (!last || exerciseSent) {
      return;
    }
    void run(() => window.retenia['study.undo']({ sessionId, activityId: last.activityId }), true);
  }, [exerciseSent, run, sessionId, view.undoable]);

  const pause = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await autosaver.flush();
      await window.retenia['study.pause']({ sessionId });
      onExit();
    } catch {
      setFailed(texts.study.actionFailed);
      inFlight.current = false;
      setBusy(false);
    }
  }, [autosaver, onExit, sessionId]);

  const flag = () => {
    if (!current) {
      return;
    }
    void run(() =>
      window.retenia['study.flag']({
        sessionId,
        activityId: current.activityId,
        attemptId: attempt.attemptId,
      }),
    ).then((done) => {
      if (done) {
        landOnReviews();
        onToast(texts.study.flagged);
      }
    });
  };

  const skip = () => {
    if (!current) {
      return;
    }
    void run(() => window.retenia['study.skip']({ sessionId, activityId: current.activityId }));
  };

  // «Editar»: la ficha en un panel; al guardar o cancelar, la misma tarjeta con lo escrito intacto.
  // Si la dejaste en pausa o fuera de los repasos, sale de la sesión como hecha.
  const closeEditor = () => {
    setEditing(null);
    void run(() => window.retenia['study.view']({ sessionId }));
  };

  const firstInteraction = () => {
    if (current && !interacted.current) {
      interacted.current = true;
      mark(current.activityId, 'firstInteraction');
    }
  };
  // Escribir algo empieza el intento: se prende «Pista» (CA-135).
  const startAttempt = () => {
    if (!help.started) {
      help.start();
    }
  };

  // «Siguiente» sobre un ejercicio.
  const exerciseDone = () => {
    if (current) {
      void run(() =>
        window.retenia['study.exerciseDone']({ sessionId, activityId: current.activityId }),
      );
    }
  };
  const exerciseSentNow = () => setSentActivity(current?.activityId ?? null);

  // Las teclas de la sesión.
  const closing = view.status === 'finished' || view.complete;
  const keys = useRef({ showAnswer, grade, undo, pause, closing, exercise });
  keys.current = { showAnswer, grade, undo, pause, closing, exercise };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = sessionKeyAction(event, {
        modalOpen: document.querySelector('[aria-modal="true"]') !== null,
        target: event.target instanceof HTMLElement ? event.target : null,
      });
      // En el cierre solo queda Ctrl+Z (deshacer la última calificación).
      if (action === null || (keys.current.closing && action.kind !== 'undo')) {
        return;
      }
      // En un ejercicio no se muestra ni se califica con teclas: cada una hace lo de siempre.
      if (keys.current.exercise && (action.kind === 'show' || action.kind === 'grade')) {
        return;
      }
      event.preventDefault();
      if (action.kind === 'show') {
        keys.current.showAnswer();
      } else if (action.kind === 'grade') {
        keys.current.grade(action.grade);
      } else if (action.kind === 'undo') {
        keys.current.undo();
      } else {
        void keys.current.pause();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (closing) {
    return (
      <main className={styles.session} aria-label={texts.study.title}>
        <h1 className="visually-hidden">{texts.study.title}</h1>
        {view.undoable ? (
          <div className={styles.bar}>
            <span className={styles.previous}>
              {texts.study.previous(GRADE_LABEL[view.undoable.grade])}
              <Boton variant="quiet" disabled={busy} onClick={undo}>
                {texts.study.undo}
              </Boton>
            </span>
          </div>
        ) : null}
        <div className={styles.main}>
          <SessionClosing
            key={view.progress.done}
            sessionId={sessionId}
            onExit={onExit}
            onToast={onToast}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.session} aria-label={texts.study.title}>
      <h1 className="visually-hidden">{texts.study.title}</h1>
      <div className={styles.bar}>
        {exercise ? null : <RotuloModo mode={help.label} />}
        <span
          className={styles.progress}
          role="status"
          aria-label={texts.study.progressLabel(view.progress.done, view.progress.total)}
        >
          {texts.study.progress(view.progress.done, view.progress.total)}
        </span>
        <div className={styles.barActions}>
          {view.undoable && !exerciseSent ? (
            <span className={styles.previous}>
              {texts.study.previous(GRADE_LABEL[view.undoable.grade])}
              <Boton variant="quiet" disabled={busy} onClick={undo}>
                {texts.study.undo}
              </Boton>
            </span>
          ) : null}
          <MenuAcciones
            label={texts.study.more}
            disabled={busy || !current}
            items={[
              { key: 'flag', text: texts.study.flag, onSelect: flag },
              {
                key: 'edit',
                text: texts.study.edit,
                onSelect: () => (current ? setEditing({ card: current.card }) : undefined),
              },
              { key: 'skip', text: texts.study.skip, onSelect: skip },
            ]}
          />
          <Boton disabled={busy} onClick={() => void pause()}>
            {texts.study.pause}
          </Boton>
        </div>
      </div>
      {current && exercise ? (
        // Sin nombre propio: el ejercicio ya trae su zona «Ejercicio».
        <div ref={question as RefObject<HTMLDivElement>} tabIndex={-1} className={styles.exercise}>
          {current.card.activityType === 'procedure' ? (
            <SessionProcedure
              key={current.activityId}
              cardId={current.cardId}
              onNext={exerciseDone}
              onSent={exerciseSentNow}
              onEditReference={(focus) => setEditing({ card: current.card, focus })}
            />
          ) : (
            <ExerciseView
              key={current.activityId}
              cardId={current.cardId}
              inSession
              onClose={() => void pause()}
              onNext={exerciseDone}
              onSent={exerciseSentNow}
              onEditReference={(focus) => setEditing({ card: current.card, focus })}
            />
          )}
          {failed === '' ? null : <BannerEstado tone="attention">{failed}</BannerEstado>}
        </div>
      ) : null}
      {exercise ? null : (
        <div className={practiceStyles.layout} data-panel={help.panel === null ? 'closed' : 'open'}>
          <div className={styles.main}>
            {shortcuts ? (
              <div className={styles.shortcuts}>
                <p>{texts.study.shortcuts}</p>
                <Boton
                  variant="quiet"
                  onClick={() => {
                    setShortcuts(false);
                    window.retenia['study.dismissShortcuts']({}).catch(() => undefined);
                  }}
                >
                  {texts.study.shortcutsOk}
                </Boton>
              </div>
            ) : null}
            {current && !exercise ? (
              <>
                <section
                  ref={question}
                  tabIndex={-1}
                  className={styles.question}
                  aria-label={texts.study.questionLabel}
                >
                  <CardPath card={current.card} />
                  <div className={styles.prompt}>
                    <CardFace content={current.card.questionContent} />
                  </div>
                </section>
                {answerShown ? (
                  <section
                    ref={answer}
                    tabIndex={-1}
                    className={styles.answer}
                    aria-label={texts.study.referenceAnswer}
                  >
                    <div
                      className={styles.compare}
                      data-compare={text.trim() === '' ? 'one' : 'two'}
                    >
                      {text.trim() === '' ? null : (
                        <div className={styles.side}>
                          <h2 className={styles.sideTitle}>{texts.study.yourAnswer}</h2>
                          <p className={styles.written}>{text}</p>
                        </div>
                      )}
                      <div className={styles.side}>
                        <h2 className={styles.sideTitle}>{texts.study.referenceAnswer}</h2>
                        <CardFace content={current.card.answerContent} />
                        {sourceChanged ? (
                          <p className={styles.sourceChanged} role="note">
                            {texts.materials.sourceChanged}
                          </p>
                        ) : null}
                        {citedMaterial && onOpenOriginal ? (
                          <Boton
                            variant="quiet"
                            onClick={() =>
                              onOpenOriginal({ materialId: citedMaterial, cardId: current.cardId })
                            }
                          >
                            {texts.materials.viewOriginal}
                          </Boton>
                        ) : null}
                      </div>
                    </div>
                    <fieldset className={styles.grades}>
                      <legend className={styles.legend}>{texts.cards.gradeGroup}</legend>
                      <div className={styles.gradeButtons}>
                        {GRADES.map(({ grade: value, label }) => (
                          <Boton key={value} disabled={busy} onClick={() => grade(value)}>
                            {label}
                          </Boton>
                        ))}
                      </div>
                    </fieldset>
                  </section>
                ) : (
                  <div className={styles.attempt}>
                    <label className={styles.field}>
                      <span className="visually-hidden">{texts.study.answerLabel}</span>
                      <textarea
                        ref={answerField}
                        className={styles.textarea}
                        placeholder={texts.study.answerPlaceholder}
                        value={text}
                        rows={3}
                        maxLength={MAX_ANSWER_LENGTH}
                        onFocus={firstInteraction}
                        onChange={(event) => {
                          firstInteraction();
                          if (event.target.value.trim() !== '') {
                            startAttempt();
                          }
                          setText(event.target.value);
                          latest.current = { ...latest.current, text: event.target.value };
                          autosaver.touch();
                        }}
                        onBlur={() => void autosaver.flush()}
                      />
                    </label>
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
                        firstInteraction();
                        help.chooseNoIdea();
                      }}
                    />
                    {help.problem === '' ? null : (
                      <BannerEstado tone="attention">{help.problem}</BannerEstado>
                    )}
                    <div className={styles.attemptFooter}>
                      {draft ? <IndicadorBorrador state={draft} /> : <span />}
                      <Boton variant="primary" disabled={busy} onClick={showAnswer}>
                        {texts.cards.showAnswer}
                      </Boton>
                    </div>
                  </div>
                )}
              </>
            ) : null}
            {failed === '' ? null : <BannerEstado tone="attention">{failed}</BannerEstado>}
          </div>
          <HelpPanel
            help={help}
            onOpenOriginal={
              onOpenOriginal && current
                ? (materialId) => onOpenOriginal({ materialId, cardId: current.cardId })
                : undefined
            }
          />
        </div>
      )}
      <ConfirmSolution help={help} />
      {editing ? (
        <Dialog title={texts.study.editTitle} placement="side" onClose={closeEditor}>
          <SheetForm
            card={editing.card}
            focusField={editing.focus}
            onSaved={closeEditor}
            onCancel={closeEditor}
          />
        </Dialog>
      ) : null}
    </main>
  );
}
