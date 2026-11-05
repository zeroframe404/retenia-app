import { useEffect, useState } from 'react';
import type { SessionRating, SessionSummary } from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { CierreSesion } from '../ui/Session';
import { ViewState } from '../ui/ViewStates';
import { AdjustPlanDialog } from './AdjustPlanDialog';
import { DoubtDialog } from './DoubtDialog';

// Lo que dice el cierre de una dificultad: el tema y la pregunta, o cuántas fueron si hubo más de
// una del mismo tema.
function difficultyText(difficulty: SessionSummary['difficulties'][number]): string {
  const topic = difficulty.topicName ?? texts.cards.noTopic;
  const [question] = difficulty.questions;
  return difficulty.questions.length === 1 && question !== undefined
    ? texts.study.closing.difficultyOne(topic, question)
    : texts.study.closing.difficultyMany(topic, difficulty.questions.length);
}

// El único próximo paso: si quedan repasos para hoy, otra sesión; si no, cuántos vencen mañana.
function nextStepText(summary: SessionSummary): string {
  return summary.remainingDueToday > 0
    ? texts.study.closing.nextMore(summary.remainingDueToday)
    : texts.study.closing.nextTomorrow(summary.dueTomorrow);
}

// El cierre honesto de una sesión (H-17): «Sesión terminada · N min», las tarjetas por resultado,
// como máximo 2 dificultades, 1 próximo paso, la frase «Completar la sesión no equivale a dominar el
// tema», «¿Cómo estuvo?» (un toque queda registrado; sin toque, nada) y «Terminar», «Guardar una
// duda» y «Ajustar el plan». Sin estadísticas de más ni festejos.
export function SessionClosing({
  sessionId,
  onExit,
  onToast,
}: {
  sessionId: string;
  onExit: () => void;
  onToast: (text: string) => void;
}) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [rating, setRating] = useState<SessionRating | null>(null);
  const [dialog, setDialog] = useState<'doubt' | 'adjust' | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` vuelve a pedir el cierre después de «Reintentar».
  useEffect(() => {
    let live = true;
    setFailed(false);
    window.retenia['study.summary']({ sessionId }).then(
      (loaded) => {
        if (live) {
          setSummary(loaded);
          setRating(loaded.rating);
        }
      },
      () => {
        if (live) {
          setFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [sessionId, attempt]);

  if (failed) {
    return (
      <ViewState
        kind="error"
        phrase={texts.study.closing.loadFailed}
        action={{ text: texts.study.retry, onClick: () => setAttempt((n) => n + 1), primary: true }}
      />
    );
  }
  if (!summary) {
    return <ViewState kind="loading" phrase={texts.study.loading} />;
  }

  const results = [
    { label: texts.cards.gradeGood, count: summary.results.good },
    { label: texts.cards.gradeHard, count: summary.results.hard },
    { label: texts.cards.gradeAgain, count: summary.results.again },
    ...(summary.results.flagged > 0
      ? [{ label: texts.study.closing.flagged, count: summary.results.flagged }]
      : []),
  ];
  const firstDifficulty = summary.difficulties[0]?.cardIds[0];

  return (
    <>
      <CierreSesion
        headingLevel={2}
        minutes={summary.minutes}
        results={results}
        difficulties={summary.difficulties.map(difficultyText)}
        nextStep={nextStepText(summary)}
        rating={rating}
        onRate={(value) => {
          setRating(value);
          window.retenia['study.rate']({
            sessionId,
            rating: value,
            ratingId: crypto.randomUUID(),
          }).catch(() => onToast(texts.study.actionFailed));
        }}
        onFinish={onExit}
        onSaveDoubt={() => setDialog('doubt')}
        onAdjustPlan={() => setDialog('adjust')}
      />
      {dialog === 'doubt' ? (
        <DoubtDialog
          cards={summary.cards}
          defaultCardId={firstDifficulty ?? summary.cards.at(-1)?.cardId ?? null}
          sessionId={sessionId}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onToast(texts.study.doubt.saved);
          }}
        />
      ) : null}
      {dialog === 'adjust' ? (
        <AdjustPlanDialog
          sessionId={sessionId}
          topic={summary.focusTopic?.name ?? null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onToast(texts.study.adjust.saved);
          }}
        />
      ) : null}
    </>
  );
}
