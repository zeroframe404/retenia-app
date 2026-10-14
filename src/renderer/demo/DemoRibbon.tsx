import { useEffect, useState } from 'react';
import { formatLongDate, texts } from '../../preload/contract/texts';
import styles from './DemoRibbon.module.css';

// Cinta superior de «Retenia (prueba)». La fecha llega por el puente desde el reloj del
// proceso principal: si la cinta se ve, el puente anda.
export function DemoRibbon() {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.retenia
      .ping({ message: 'ping' })
      .then((response) => {
        if (active) {
          setToday(response.today);
        }
      })
      .catch((error: unknown) => {
        console.error('La cinta de demostración no pudo leer la fecha por el puente', error);
      });
    return () => {
      active = false;
    };
  }, []);

  if (today === null) {
    return null;
  }
  return (
    <header className={styles.ribbon}>
      <p className={styles.text}>{texts.demoRibbon(formatLongDate(today))}</p>
    </header>
  );
}
