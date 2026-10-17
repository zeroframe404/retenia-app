import { useEffect, useRef, useState } from 'react';
import { demoTexts } from '../../preload/contract/demo-texts';
import styles from '../ui.module.css';
import { setDemoToday } from './demoDate';

const STEPS = [1, 7, 35] as const;

// Ajustes › «Demostración» (solo en «Retenia (prueba)»): corre la fecha de la demostración para
// probar el espaciado y las copias sin esperar (la cinta lo dice al instante), simula que no hay
// conexión y abre el «Laboratorio».
export function DemoSection({ onOpenLab }: { onOpenLab?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<boolean | null>(null);
  const working = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const state = await window.retenia['demo.connection']({});
        if (alive) {
          setOffline(state.offline);
        }
      } catch {
        if (alive) {
          setOffline(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

  async function toggleConnection(next: boolean) {
    setOffline(next);
    try {
      setOffline((await window.retenia['demo.setConnection']({ offline: next })).offline);
    } catch {
      setOffline(!next);
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
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={offline ?? false}
          disabled={offline === null}
          onChange={(event) => void toggleConnection(event.target.checked)}
        />
        {demoTexts.offline}
      </label>
      {onOpenLab ? (
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onOpenLab}>
            {demoTexts.lab.open}
          </button>
        </div>
      ) : null}
    </section>
  );
}
