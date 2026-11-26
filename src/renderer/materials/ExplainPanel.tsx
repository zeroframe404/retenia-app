import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiOutcome } from '../../preload/contract/ai';
import type { MaterialSelection } from '../../preload/contract/materials';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog, SidePanel } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Materials.module.css';

// «Explicame este fragmento» (Fase 19): el panel lateral con la respuesta de la IA, separada en
// «Según tu material» (cada idea con su cita, comprobada letra por letra en el pasaje) y «Aporte del
// modelo, no verificado», con la marca de que la armó la IA y el costo de esa consulta. Antes de
// mandar un material por primera vez pregunta el permiso. Nada de esto se guarda como dato de
// aprendizaje. Sin conexión queda pendiente y la respuesta llega sola (un aviso del principal).

type Shown = AiOutcome | { state: 'loading' } | { state: 'unavailable' };

export function ExplainPanel({
  materialId,
  selection,
  requestId,
  onClose,
  onConfigure,
  onLocate,
  onPending,
  onWatching,
}: {
  materialId: string;
  selection: MaterialSelection;
  // Un pedido ya hecho (el que estaba pendiente y llegó): se muestra su resultado sin volver a pedir.
  requestId?: string | undefined;
  onClose: () => void;
  // Lleva a Ajustes › «Inteligencia artificial».
  onConfigure: () => void;
  // Marca en el texto el pasaje de una cita.
  onLocate: (quote: string) => void;
  // Avisa que quedó pendiente y qué pedido está mirando (nulo al cerrarse o al terminar).
  onPending?: ((requestId: string) => void) | undefined;
  onWatching?: ((requestId: string | null) => void) | undefined;
}) {
  const [shown, setShown] = useState<Shown>({ state: 'loading' });
  const [asking, setAsking] = useState(false);
  const alive = useRef(true);

  const ask = useCallback(
    async (permission?: 'once' | 'always' | 'never') => {
      setShown({ state: 'loading' });
      try {
        const outcome = await window.retenia['ai.explain']({
          materialId,
          selection,
          ...(permission ? { permission } : {}),
        });
        if (!alive.current) {
          return;
        }
        if (outcome.state === 'needs_permission') {
          setAsking(true);
          return;
        }
        setShown(outcome);
      } catch {
        if (alive.current) {
          setShown({ state: 'unavailable' });
        }
      }
    },
    [materialId, selection],
  );

  useEffect(() => {
    alive.current = true;
    if (requestId === undefined) {
      void ask();
    } else {
      window.retenia['ai.outcome']({ requestId }).then(
        (outcome) => {
          if (alive.current) {
            setShown(outcome);
          }
        },
        () => void ask(),
      );
    }
    return () => {
      alive.current = false;
    };
  }, [ask, requestId]);

  // Mientras está pendiente, el resultado llega por un aviso; se pide también una vez al empezar a
  // escuchar, por si llegó antes.
  const pendingId = shown.state === 'pending' ? shown.requestId : null;
  useEffect(() => {
    if (pendingId === null) {
      return;
    }
    onPending?.(pendingId);
    onWatching?.(pendingId);
    const refresh = () => {
      window.retenia['ai.outcome']({ requestId: pendingId }).then(
        (outcome) => {
          if (alive.current) {
            setShown(outcome);
          }
        },
        () => undefined,
      );
    };
    const stop = window.reteniaAvisos?.alRecibir((event) => {
      if (event.type.startsWith('ai.') && 'requestId' in event && event.requestId === pendingId) {
        refresh();
      }
    });
    refresh();
    return () => {
      stop?.();
      onWatching?.(null);
    };
  }, [pendingId, onPending, onWatching]);

  const choose = (permission: 'once' | 'always' | 'never') => {
    setAsking(false);
    void ask(permission);
  };

  return (
    <SidePanel title={texts.ai.panelTitle} onClose={onClose}>
      <Body
        shown={shown}
        onRetry={() => void ask()}
        onAllow={() => setAsking(true)}
        onConfigure={onConfigure}
        onLocate={onLocate}
      />
      {asking ? (
        <Dialog title={texts.ai.permissionQuestion} onClose={onClose}>
          <p>{texts.ai.permissionDetail}</p>
          <div className={styles.dialogActions}>
            <Boton variant="primary" onClick={() => choose('once')}>
              {texts.ai.permissionOnce}
            </Boton>
            <Boton onClick={() => choose('always')}>{texts.ai.permissionAlways}</Boton>
            <Boton onClick={() => choose('never')}>{texts.ai.permissionNo}</Boton>
          </div>
        </Dialog>
      ) : null}
    </SidePanel>
  );
}

function Body({
  shown,
  onRetry,
  onAllow,
  onConfigure,
  onLocate,
}: {
  shown: Shown;
  onRetry: () => void;
  onAllow: () => void;
  onConfigure: () => void;
  onLocate: (quote: string) => void;
}) {
  switch (shown.state) {
    case 'loading':
    case 'needs_permission':
      return <p className={styles.reading}>{texts.ai.preparing}</p>;
    case 'unavailable':
      return (
        <>
          <BannerEstado tone="attention">{texts.ai.unavailable}</BannerEstado>
          <Boton onClick={onRetry}>{texts.ai.retry}</Boton>
        </>
      );
    case 'pending':
      if (shown.reason === 'offline') {
        return <BannerEstado tone="pending">{texts.ai.pendingOffline}</BannerEstado>;
      }
      return shown.reason === 'retrying' ? (
        <BannerEstado tone="pending">{texts.ai.pendingRetry}</BannerEstado>
      ) : (
        <p className={styles.reading}>{texts.ai.preparing}</p>
      );
    case 'blocked':
      return <Blocked shown={shown} onConfigure={onConfigure} onAllow={onAllow} />;
    case 'failed':
      return (
        <>
          <BannerEstado tone="attention">{texts.ai.failed[shown.reason]}</BannerEstado>
          {shown.reason === 'auth' || shown.reason === 'billing' ? (
            <Boton onClick={onConfigure}>{texts.ai.configure}</Boton>
          ) : shown.reason === 'cancelled' ? null : (
            <Boton onClick={onRetry}>{texts.ai.retry}</Boton>
          )}
        </>
      );
    case 'done':
      return <Explanation shown={shown} onLocate={onLocate} />;
  }
}

function Blocked({
  shown,
  onConfigure,
  onAllow,
}: {
  shown: Extract<AiOutcome, { state: 'blocked' }>;
  onConfigure: () => void;
  onAllow: () => void;
}) {
  switch (shown.reason) {
    case 'not_connected':
      return (
        <>
          <BannerEstado tone="info">{texts.ai.notConnected}</BannerEstado>
          <Boton variant="primary" onClick={onConfigure}>
            {texts.ai.configure}
          </Boton>
        </>
      );
    case 'local_only':
      return (
        <>
          <BannerEstado tone="info">{texts.ai.localOnlyOn}</BannerEstado>
          <Boton onClick={onConfigure}>{texts.ai.goToSettings}</Boton>
        </>
      );
    case 'suspended':
      return (
        <>
          <BannerEstado tone="info">
            {texts.ai.suspended(texts.ai.purposes.explain_fragment)}
          </BannerEstado>
          <Boton onClick={onConfigure}>{texts.ai.goToSettings}</Boton>
        </>
      );
    case 'too_long':
      return <BannerEstado tone="info">{texts.ai.tooLong}</BannerEstado>;
    case 'cap_reached':
      return (
        <>
          <BannerEstado tone="attention">{texts.ai.capReached}</BannerEstado>
          <p>{texts.ai.counter(shown.spentMicros, shown.capCents)}</p>
          <Boton onClick={onConfigure}>{texts.ai.changeCap}</Boton>
        </>
      );
    case 'permission_denied':
      return (
        <>
          <BannerEstado tone="info">{texts.ai.denied}</BannerEstado>
          <Boton onClick={onAllow}>{texts.ai.allow}</Boton>
        </>
      );
  }
}

// Una clave estable para cada aporte (dos iguales se distinguen por cuántas veces apareció).
function keyedByText(items: readonly string[]): { key: string; text: string }[] {
  const seen = new Map<string, number>();
  return items.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { key: `${count}-${text}`, text };
  });
}

function Explanation({
  shown,
  onLocate,
}: {
  shown: Extract<AiOutcome, { state: 'done' }>;
  onLocate: (quote: string) => void;
}) {
  const { result, cost, percentUsed } = shown;
  const costLine =
    cost.kind === 'paid'
      ? texts.ai.cost(cost.micros)
      : cost.kind === 'cached'
        ? texts.ai.cached
        : texts.ai.simulatedCost;
  return (
    <div className={styles.explanation}>
      <p className={styles.aiMark}>{texts.ai.mark}</p>
      <section className={styles.explanationPart} aria-labelledby="explicacion-material">
        <h3 id="explicacion-material" className={styles.explanationTitle}>
          {texts.ai.fromMaterial}
        </h3>
        {result.fromMaterial.length === 0 ? (
          <p className={styles.reading}>{texts.ai.noQuotes}</p>
        ) : (
          <ul className={styles.explanationList}>
            {result.fromMaterial.map((item) => (
              <li key={`${item.start}-${item.end}`}>
                <button
                  type="button"
                  className={styles.quoteButton}
                  aria-label={texts.ai.goToQuote(item.quote)}
                  onClick={() => onLocate(item.quote)}
                >
                  <span className={styles.quote}>{`«${item.quote}»`}</span>
                </button>
                <p>{item.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {result.modelContribution.length > 0 ? (
        <section className={styles.explanationPart} aria-labelledby="explicacion-aporte">
          <h3 id="explicacion-aporte" className={styles.explanationTitle}>
            {texts.ai.modelContribution}
          </h3>
          <ul className={styles.explanationList}>
            {keyedByText(result.modelContribution).map(({ key, text }) => (
              <li key={key}>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className={styles.explanationCost}>{costLine}</p>
      {percentUsed !== null ? (
        <BannerEstado tone="attention">
          {percentUsed >= 100 ? texts.ai.capReached : texts.ai.warning(percentUsed)}
        </BannerEstado>
      ) : null}
    </div>
  );
}
