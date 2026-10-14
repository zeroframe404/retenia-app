import { useRef, useState } from 'react';
import { demoTexts } from '../../preload/contract/demo-texts';
import styles from '../ui.module.css';
import { setDemoToday } from './demoDate';

const STEPS = [1, 7, 35] as const;

// Ajustes › «Demostración» (solo en «Retenia (prueba)»): corre la fecha de la demostración para
// probar el espaciado y las copias sin esperar. La cinta lo dice al instante.
export function DemoSection() {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  async function change(request: () => Promise<{ today: string }>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      setDemoToday((await request()).today);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="titulo-demostracion">
      <h3 id="titulo-demostracion">{demoTexts.section}</h3>
      <div className={styles.actions}>
        {STEPS.map((days) => (
          <button
            key={days}
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => void change(() => window.retenia['demo.advanceDays']({ days }))}
          >
            {demoTexts.advance[days]}
          </button>
        ))}
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => void change(() => window.retenia['demo.resetDate']({}))}
        >
          {demoTexts.reset}
        </button>
      </div>
      {failed ? <p className={styles.formError}>{demoTexts.failed}</p> : null}
    </section>
  );
}
