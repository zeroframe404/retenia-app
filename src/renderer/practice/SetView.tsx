import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicroProposal, SetRun, SetSummary } from '../../preload/contract/procedures';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { ExerciseView, type ReferenceField } from './ExerciseView';
import { MicroExerciseView, MicroProposalCard } from './MicroExercise';
import styles from './Practice.module.css';

// El conjunto mezclado (Fase 18, CA-162): los problemas de a uno, sin decir de qué tipo es cada
// uno. El cierre muestra el orden de tipos que salió.

const text = texts.practice.set;

export function SetView({
  cardId,
  onClose,
  onEditReference,
  onOpenOriginal,
}: {
  cardId: string;
  onClose: () => void;
  onEditReference: (cardId: string, field: ReferenceField) => void;
  onOpenOriginal?: ((materialId: string) => void) | undefined;
}) {
  // La vuelta que se pide; si quedó una de hoy a medias, el principal responde con esa y desde
  // ahí se sigue con la suya.
  const runId = useRef('');
  if (runId.current === '') {
    runId.current = crypto.randomUUID();
  }
  const [run, setRun] = useState<SetRun | null>(null);
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [micro, setMicro] = useState<MicroProposal | null>(null);

  // Pide el próximo problema (o el cierre, si ya no queda ninguno).
  const advance = useCallback(async () => {
    setFailed(false);
    try {
      const next = await window.retenia['sets.open']({ cardId, runId: runId.current });
      if (next.kind === 'run') {
        runId.current = next.runId;
      }
      if (next.kind === 'run' && next.nextCardId === null) {
        setSummary(await window.retenia['sets.summary']({ runId: next.runId }));
      }
      setRun(next);
    } catch {
      setFailed(true);
    }
  }, [cardId]);

  useEffect(() => {
    void advance();
  }, [advance]);

  const back = <Boton onClick={onClose}>{texts.practice.backToCards}</Boton>;
  if (micro !== null) {
    return <MicroExerciseView proposal={micro} onDone={() => setMicro(null)} />;
  }
  if (failed) {
    return (
      <ScreenFrame level={3} title={texts.practice.exerciseTitle}>
        <BannerEstado tone="attention">{text.failed}</BannerEstado>
        <div className={styles.actions}>
          <Boton variant="primary" onClick={() => void advance()}>
            {texts.cards.retry}
          </Boton>
          {back}
        </div>
      </ScreenFrame>
    );
  }
  if (run === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  if (run.kind !== 'run') {
    return (
      <ScreenFrame level={3} title={texts.practice.exerciseTitle}>
        <BannerEstado tone="attention">
          {run.kind === 'notReady' ? text.notReady(run.missing) : text.invalid[run.reason]}
        </BannerEstado>
        <div className={styles.actions}>{back}</div>
      </ScreenFrame>
    );
  }
  if (summary !== null) {
    return (
      <ScreenFrame level={3} title={text.closingTitle}>
        <p className={styles.prompt}>{summary.title}</p>
        <h3 className={styles.diffTitle}>{text.orderHeading}</h3>
        <ol className={styles.setOrder} aria-label={text.orderHeading}>
          {summary.order.map((item) => (
            <li key={item.position}>
              {text.orderItem(
                item.typeName,
                item.verdict === null
                  ? text.unanswered
                  : texts.practice.verdicts[item.verdict].replace(/\.$/, ''),
              )}
            </li>
          ))}
        </ol>
        <MicroProposalCard onStart={setMicro} />
        <div className={styles.actions}>
          <Boton variant="primary" onClick={onClose}>
            {texts.practice.backToCards}
          </Boton>
        </div>
      </ScreenFrame>
    );
  }
  if (run.nextCardId === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  const next = run.nextCardId;
  return (
    <div className={styles.setRun}>
      <p className={styles.setProgress} aria-live="polite">
        {run.title} · {text.progress(Math.min(run.done + 1, run.total), run.total)}
      </p>
      <ExerciseView
        key={next}
        cardId={next}
        runId={run.runId}
        onClose={onClose}
        onNext={() => void advance()}
        onEditReference={(field) => onEditReference(next, field)}
        onOpenOriginal={onOpenOriginal}
      />
    </div>
  );
}
