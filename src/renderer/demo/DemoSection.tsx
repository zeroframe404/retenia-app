import { useEffect, useRef, useState } from 'react';
import { demoTexts } from '../../preload/contract/demo-texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { setDemoToday } from './demoDate';

const STEPS = [1, 7, 35] as const;

// Ajustes › «Demostración» (solo en «Retenia (prueba)»): corre la fecha de la demostración para
// probar el espaciado y las copias sin esperar (la cinta lo dice al instante), simula que no hay
// conexión y abre el «Laboratorio» y la «Galería».
export function DemoSection({
  onOpenLab,
  onOpenGallery,
}: {
  onOpenLab?: () => void;
  onOpenGallery?: () => void;
}) {
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
    <ScreenFrame level={3} title={demoTexts.section}>
      <div className={styles.actions}>
        {STEPS.map((days) => (
          <Boton
            key={days}
            disabled={busy}
            onClick={() => void change(() => window.retenia['demo.advanceDays']({ days }))}
          >
            {demoTexts.advance[days]}
          </Boton>
        ))}
        <Boton
          disabled={busy}
          onClick={() => void change(() => window.retenia['demo.resetDate']({}))}
        >
          {demoTexts.reset}
        </Boton>
      </div>
      {failed ? <BannerEstado tone="attention">{demoTexts.failed}</BannerEstado> : null}
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={offline ?? false}
          disabled={offline === null}
          onChange={(event) => void toggleConnection(event.target.checked)}
        />
        {demoTexts.offline}
      </label>
      {onOpenLab || onOpenGallery ? (
        <div className={styles.actions}>
          {onOpenGallery ? <Boton onClick={onOpenGallery}>{demoTexts.gallery.open}</Boton> : null}
          {onOpenLab ? <Boton onClick={onOpenLab}>{demoTexts.lab.open}</Boton> : null}
        </div>
      ) : null}
    </ScreenFrame>
  );
}
