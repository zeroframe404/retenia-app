import { useEffect, useRef, useState } from 'react';
import { demoTexts } from '../../preload/contract/demo-texts';
import { Boton } from '../ui/Boton';
import { BannerEstado } from '../ui/Process';

// Solo en «Retenia (prueba)»: la pantalla de la primera vez no tiene riel, y sin esto no habría
// cómo salir de ahí. Si la demostración está abierta en ese modo, ofrece «Volver al elenco».
export function DemoFirstTimeExit({ onDataChanged }: { onDataChanged: () => void }) {
  const [firstTime, setFirstTime] = useState(false);
  const [failed, setFailed] = useState(false);
  const working = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { mode } = await window.retenia['demo.dataMode']({});
        if (alive) {
          setFirstTime(mode === 'first-time');
        }
      } catch {
        if (alive) {
          setFirstTime(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function back() {
    if (working.current) {
      return;
    }
    working.current = true;
    setFailed(false);
    try {
      await window.retenia['demo.useCast']({});
      onDataChanged();
    } catch {
      setFailed(true);
      working.current = false;
    }
  }

  if (!firstTime) {
    return null;
  }
  return (
    <>
      {failed ? <BannerEstado tone="attention">{demoTexts.firstTime.failed}</BannerEstado> : null}
      <div>
        <Boton variant="quiet" onClick={() => void back()}>
          {demoTexts.firstTime.back}
        </Boton>
      </div>
    </>
  );
}
