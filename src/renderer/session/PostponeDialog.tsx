import { useEffect, useId, useRef, useState } from 'react';
import type { PostponeResult, SessionMinutes } from '../../preload/contract/study';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import formStyles from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Session.module.css';

type When = 'later' | 'tomorrow' | 'day';

// El día siguiente a uno dado, «AAAA-MM-DD»: el campo de fecha no deja elegir antes de mañana.
function dayAfter(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

// Lo que dice el cartel después de posponer, y si hubo repasos que entraron igual.
function messageOf(when: When, result: PostponeResult): string {
  const proposal = texts.study.proposal;
  const base =
    when === 'later'
      ? proposal.postponedLater
      : when === 'tomorrow'
        ? proposal.postponedTomorrow
        : proposal.postponedDay(formatShortDate(result.plannedDay));
  return result.forced > 0 ? `${base}. ${proposal.postponedForced(result.forced)}` : base;
}

// «Posponer»: tres opciones, «Más tarde hoy», «Mañana» y «Elegir día» (un campo de fecha y su
// «Confirmar»). Los repasos de la propuesta quedan aplazados, sin calificarse; los que ya se
// pospusieron 3 veces entran igual.
export function PostponeDialog({
  minutes,
  onClose,
  onPostponed,
}: {
  minutes: SessionMinutes;
  onClose: () => void;
  onPostponed: (message: string) => void;
}) {
  const fieldId = useId();
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState('');
  const [earliest, setEarliest] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const inFlight = useRef(false);

  // El día de hoy lo sabe el programa (no la ventana): de ahí sale el primer día que se puede elegir.
  useEffect(() => {
    let live = true;
    window.retenia.ping({ message: 'ping' }).then(
      ({ today }) => {
        if (live) {
          setEarliest(dayAfter(today));
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  async function postpone(when: When) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setProblem('');
    try {
      const result = await window.retenia['study.postpone']({
        requestId: crypto.randomUUID(),
        minutes,
        when,
        ...(when === 'day' ? { day } : {}),
      });
      onPostponed(messageOf(when, result));
    } catch {
      setProblem(texts.study.proposal.postponeFailed);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog title={texts.study.proposal.postponeTitle} onClose={onClose}>
      <div className={styles.postponeOptions}>
        <Boton disabled={busy} onClick={() => void postpone('later')}>
          {texts.study.proposal.postponeLater}
        </Boton>
        <Boton disabled={busy} onClick={() => void postpone('tomorrow')}>
          {texts.study.proposal.postponeTomorrow}
        </Boton>
        {picking ? null : (
          <Boton disabled={busy} onClick={() => setPicking(true)}>
            {texts.study.proposal.postponePickDay}
          </Boton>
        )}
      </div>
      {picking ? (
        <form
          className={formStyles.inline}
          onSubmit={(event) => {
            event.preventDefault();
            if (day !== '') {
              void postpone('day');
            }
          }}
        >
          <div className={formStyles.field}>
            <label htmlFor={fieldId}>{texts.study.proposal.postponeDayLabel}</label>
            <input
              id={fieldId}
              type="date"
              autoFocus
              value={day}
              {...(earliest === undefined ? {} : { min: earliest })}
              onChange={(event) => setDay(event.target.value)}
            />
          </div>
          <div className={styles.dialogActions}>
            <Boton type="submit" variant="primary" disabled={busy || day === ''}>
              {texts.study.proposal.postponeConfirm}
            </Boton>
          </div>
        </form>
      ) : null}
      {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
    </Dialog>
  );
}
