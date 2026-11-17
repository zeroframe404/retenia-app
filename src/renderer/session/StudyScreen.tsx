import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { SessionView, StudyOverview } from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import styles from './Session.module.css';

// Estudiar (Fase 10): la materia activa y «Empezar», que arma una sesión con las 10 vencidas que
// tenés más riesgo de olvidar (la composición por minutos llega en la Fase 11). Con una sesión de
// hoy a medias, el primario es «Continuar: sesión de hoy (4 de 10)» y «Empezar» pasa a secundario
// (empezar otra deja la anterior, con sus repasos). Siempre hay un solo primario.
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
  const [overview, setOverview] = useState<StudyOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve a leer al cambiar la materia activa o al reintentar.
  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    window.retenia['study.overview']({}).then(
      (loaded) => {
        if (live) {
          setOverview(loaded);
        }
      },
      () => {
        if (live) {
          setLoadFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [activeSubjectId, attempt]);

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

  const start = () => open(() => window.retenia['study.start']({ sessionId: crypto.randomUUID() }));

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
  } else if (overview.resumable) {
    const { sessionId, done, total } = overview.resumable;
    content = (
      <div className={styles.startActions}>
        <Boton
          variant="primary"
          disabled={busy}
          onClick={() =>
            void open(() => window.retenia['study.resume']({ sessionId }), texts.study.resumeFailed)
          }
        >
          {texts.study.resume(done, total)}
        </Boton>
        <Boton disabled={busy || overview.dueCount === 0} onClick={() => void start()}>
          {texts.study.start}
        </Boton>
      </div>
    );
  } else {
    content = (
      <>
        <div className={styles.startActions}>
          <Boton
            variant="primary"
            disabled={busy || overview.dueCount === 0}
            onClick={() => void start()}
          >
            {texts.study.start}
          </Boton>
        </div>
        {overview.dueCount === 0 && overview.subjectName !== null ? (
          <p className={styles.note}>{texts.study.nothingDue(overview.subjectName)}</p>
        ) : null}
      </>
    );
  }

  return (
    <ScreenFrame title={texts.nav.study} focusTitle={focusTitle}>
      {before}
      <div className={styles.start}>
        {content}
        {failed === '' ? null : <BannerEstado tone="attention">{failed}</BannerEstado>}
      </div>
    </ScreenFrame>
  );
}
