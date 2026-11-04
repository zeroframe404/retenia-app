import { useState } from 'react';
import type { CardWhyToday } from '../../preload/contract/cards';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from './Cards.module.css';

// «¿Por qué hoy?» (CA-065): al tocarlo, una frase con los días desde el último repaso, cómo salió
// y la probabilidad estimada de recordarla dicha como «unos N de cada 10», sin decimales; con pocos
// intentos tuyos, además, «Estimación general (sin datos tuyos)». Se vuelve a calcular cada vez.
export function WhyToday({ cardId }: { cardId: string }) {
  const [answer, setAnswer] = useState<CardWhyToday | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      setAnswer(await window.retenia['cards.whyToday']({ cardId }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.why}>
      <div>
        <Boton variant="quiet" busy={busy} onClick={() => void ask()}>
          {texts.cards.whyToday}
        </Boton>
      </div>
      {failed ? <p role="status">{texts.cards.whyTodayFailed}</p> : null}
      {answer === null ? null : (
        <div role="status" className={styles.whyAnswer}>
          <p>
            {answer.kind === 'new'
              ? texts.cards.whyTodayNew
              : answer.kind === 'ahead'
                ? texts.cards.whyTodayAhead
                : texts.cards.whyTodaySeen(answer.daysSince, answer.lastResult, answer.outOfTen)}
          </p>
          {answer.general ? (
            <p className={styles.fieldHelp}>{texts.cards.generalEstimate}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
