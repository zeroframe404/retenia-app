import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  SESSION_MINUTES,
  type SessionFocus,
  type SessionMinutes,
  type SessionView,
  type StudyAlternative,
  type StudyOverview,
  type StudyProposal,
} from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame, Toast } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { PostponeDialog } from './PostponeDialog';
import styles from './Session.module.css';

// La «versión corta»: una sesión de 10 minutos que empieza directo.
const SHORT_MINUTES: SessionMinutes = 10;

// Cómo se ve cada alternativa de «Elegir otra actividad» y qué parte de lo de hoy estudia. Un tema
// sin identificador no se puede estudiar solo: no se ofrece.
function alternativeText(alternative: StudyAlternative): string {
  const proposal = texts.study.proposal;
  if (alternative.kind === 'reviewsOnly') {
    return proposal.reviewsOnly(alternative.reviews, alternative.shownMinutes);
  }
  if (alternative.kind === 'newOnly') {
    return proposal.newOnly(alternative.newCards, alternative.shownMinutes);
  }
  return proposal.topic(
    alternative.topicName ?? texts.cards.noTopic,
    alternative.reviews,
    alternative.newCards,
    alternative.shownMinutes,
  );
}

function alternativeFocus(alternative: StudyAlternative): SessionFocus | null {
  if (alternative.kind === 'topic') {
    return alternative.topicId === null ? null : { kind: 'topic', topicId: alternative.topicId };
  }
  return { kind: alternative.kind };
}

// El aviso de frenos: cuántos días de repasos atrasados hay y cuándo vuelven las tarjetas nuevas.
// Es un dato, en texto neutro: nunca un contador ni un color de alarma.
function brakeText(proposal: StudyProposal): string | null {
  const { band, days } = proposal.brake;
  return band === 'full' ? null : texts.study.proposal.brake(band, days, proposal.newCards);
}

// Estudiar (Fase 10 y 11): la materia activa y la propuesta de hoy para los minutos que tenés, con
// «Empezar». Con una sesión de hoy a medias, el primario es «Continuar: sesión de hoy (4 de 70)» y
// «Empezar» pasa a secundario (empezar otra deja la anterior, con sus repasos). Siempre hay un solo
// primario. Los minutos de «Tengo:» valen solo esta vez: viven en la pantalla y no se guardan.
export function StudyScreen({
  focusTitle,
  before,
  activeSubjectId,
  onStudy,
}: {
  focusTitle: boolean;
  before: ReactNode;
  // Cambia cuando se activa otra materia: se vuelve a leer.
  activeSubjectId: string | null;
  onStudy: (view: SessionView) => void;
}) {
  const titleId = useId();
  const otherId = useId();
  const postponeId = useId();
  const noteId = useId();
  const [overview, setOverview] = useState<StudyOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failed, setFailed] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);
  // Los minutos elegidos en «Tengo:», para la materia que se mira: con otra materia o al volver a
  // abrir la pantalla, vuelven los de siempre.
  const [picked, setPicked] = useState<{
    minutes: SessionMinutes;
    subjectId: string | null;
  } | null>(null);
  const minutes = picked !== null && picked.subjectId === activeSubjectId ? picked.minutes : null;
  // Mientras se recalcula la propuesta, la anterior sigue en pantalla: nada salta ni pierde el foco.
  const [recalculating, setRecalculating] = useState(true);
  const [postponing, setPostponing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // Después de posponer, cuando la propuesta se vuelve a leer, el foco vuelve a «Posponer» o, si ya no
  // hay propuesta, a la frase que dice por qué.
  const refocus = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve a leer al cambiar la materia activa, los minutos o al reintentar.
  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    setRecalculating(true);
    window.retenia['study.overview'](minutes === null ? {} : { minutes }).then(
      (loaded) => {
        if (live) {
          setOverview(loaded);
          setRecalculating(false);
        }
      },
      () => {
        if (live) {
          setLoadFailed(true);
          setRecalculating(false);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [activeSubjectId, attempt, minutes]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando llega una lectura nueva.
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      (document.getElementById(postponeId) ?? document.getElementById(noteId))?.focus();
    }
  }, [overview]);

  // Si no se pudo (por ejemplo, la sesión pausada era de ayer y ya pasaron las 04:00), se dice y se
  // vuelve a leer lo de hoy.
  async function open(action: () => Promise<SessionView>, problem = texts.study.startFailed) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailed('');
    try {
      onStudy(await action());
    } catch {
      setFailed(problem);
      inFlight.current = false;
      setBusy(false);
      setAttempt((n) => n + 1);
    }
  }

  const start = (request: { minutes: SessionMinutes; only?: SessionFocus }) =>
    open(() => window.retenia['study.start']({ sessionId: crypto.randomUUID(), ...request }));

  const proposal = overview?.proposal ?? null;
  const hasContent = proposal !== null && (proposal.reviews > 0 || proposal.newCards > 0);
  // Los minutos que se pidieron: valen aunque la propuesta todavía se esté recalculando.
  const chosenMinutes = minutes ?? proposal?.defaultMinutes ?? null;

  let content: ReactNode;
  if (loadFailed) {
    content = (
      <ViewState
        kind="error"
        phrase={texts.study.loadFailed}
        action={{ text: texts.study.retry, onClick: () => setAttempt((n) => n + 1), primary: true }}
      />
    );
  } else if (overview === null) {
    // Mientras se lee, el primario ya está (sin poder tocarse): la pantalla no salta.
    content = (
      <div className={styles.startActions}>
        <Boton variant="primary" disabled>
          {texts.study.start}
        </Boton>
      </div>
    );
  } else {
    const { resumable } = overview;
    const resume = resumable ? (
      <Boton
        variant="primary"
        disabled={busy}
        onClick={() =>
          void open(
            () => window.retenia['study.resume']({ sessionId: resumable.sessionId }),
            texts.study.resumeFailed,
          )
        }
      >
        {texts.study.resume(resumable.done, resumable.total)}
      </Boton>
    ) : null;

    if (proposal === null || !hasContent) {
      // Sin propuesta para empezar: «Empezar» está pero no se puede tocar y se dice por qué.
      content = (
        <>
          <div className={styles.startActions}>
            {resume}
            <Boton variant={resumable ? 'secondary' : 'primary'} disabled>
              {texts.study.start}
            </Boton>
          </div>
          {overview.subjectName !== null ? (
            <p id={noteId} tabIndex={-1} className={styles.note}>
              {texts.study.nothingDue(overview.subjectName)}
            </p>
          ) : null}
        </>
      );
    } else {
      const canStart = !busy && !recalculating;
      const brake = brakeText(proposal);
      const alternatives = proposal.alternatives.flatMap((alternative) => {
        const focus = alternativeFocus(alternative);
        return focus === null ? [] : [{ alternative, focus }];
      });
      const showAlternatives = choosing && alternatives.length > 0;
      content = (
        <section
          className={styles.proposal}
          data-stroke="dashed"
          aria-labelledby={titleId}
          aria-busy={recalculating ? true : undefined}
        >
          <h3 id={titleId} className={styles.proposalTitle}>
            {texts.study.proposal.title(proposal.minutes)}
          </h3>
          <p className={styles.headline}>
            <span>
              {texts.study.proposal.headline(
                proposal.reviews,
                proposal.newCards,
                proposal.shownMinutes,
                proposal.minutes === 5 && proposal.forTomorrow > 0,
              )}
            </span>
            {proposal.initialEstimate ? (
              <span className={styles.tag}>{texts.study.proposal.initialEstimate}</span>
            ) : null}
          </p>
          <p className={styles.why}>
            {texts.study.proposal.why(proposal.why.due, proposal.initialEstimate)}
          </p>
          {brake === null ? null : <p className={styles.brake}>{brake}</p>}
          {proposal.postponedCount > 0 ? (
            <p className={styles.note}>
              {texts.study.proposal.postponedNote(proposal.postponedCount)}
            </p>
          ) : null}
          <div className={styles.startActions}>
            {resume}
            <Boton
              variant={resumable ? 'secondary' : 'primary'}
              disabled={!canStart}
              onClick={() => void start({ minutes: proposal.minutes })}
            >
              {texts.study.start}
            </Boton>
            <Boton disabled={!canStart} onClick={() => void start({ minutes: SHORT_MINUTES })}>
              {texts.study.proposal.shortVersion}
            </Boton>
            {alternatives.length > 0 ? (
              <Boton
                id={otherId}
                aria-expanded={showAlternatives}
                onClick={() => setChoosing((open) => !open)}
              >
                {texts.study.proposal.otherActivity}
              </Boton>
            ) : null}
          </div>
          {showAlternatives ? (
            <div className={styles.alternatives}>
              <fieldset className={styles.alternativeList}>
                <legend className="visually-hidden">{texts.study.proposal.otherActivities}</legend>
                {alternatives.map(({ alternative, focus }) => (
                  <Boton
                    key={`${alternative.kind}:${alternative.topicId ?? ''}`}
                    disabled={!canStart}
                    onClick={() => void start({ minutes: proposal.minutes, only: focus })}
                  >
                    {alternativeText(alternative)}
                  </Boton>
                ))}
              </fieldset>
              <Boton
                variant="quiet"
                onClick={() => {
                  setChoosing(false);
                  document.getElementById(otherId)?.focus();
                }}
              >
                {texts.study.proposal.close}
              </Boton>
            </div>
          ) : null}
          <div className={styles.haveRow}>
            <fieldset className={styles.have}>
              <legend className={styles.haveLabel}>{texts.study.proposal.have}</legend>
              <div className={styles.haveOptions}>
                {SESSION_MINUTES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.minuteOption}
                    aria-pressed={option === chosenMinutes}
                    onClick={() => {
                      if (option !== chosenMinutes) {
                        setPicked({ minutes: option, subjectId: activeSubjectId });
                      }
                    }}
                  >
                    {option}
                  </button>
                ))}
                <span className={styles.haveUnit}>{texts.study.proposal.haveUnit}</span>
              </div>
            </fieldset>
            <Boton
              id={postponeId}
              variant="quiet"
              disabled={busy}
              onClick={() => setPostponing(true)}
            >
              {texts.study.proposal.postpone}
            </Boton>
          </div>
        </section>
      );
    }
  }

  return (
    <ScreenFrame title={texts.nav.study} focusTitle={focusTitle}>
      {before}
      <div className={styles.start}>
        <Toast onClose={() => setNotice('')}>{notice}</Toast>
        {content}
        {failed === '' ? null : <BannerEstado tone="attention">{failed}</BannerEstado>}
      </div>
      {postponing && chosenMinutes !== null ? (
        <PostponeDialog
          minutes={chosenMinutes}
          onClose={() => setPostponing(false)}
          onPostponed={(message) => {
            refocus.current = true;
            setPostponing(false);
            setNotice(message);
            setAttempt((n) => n + 1);
          }}
        />
      ) : null}
    </ScreenFrame>
  );
}
