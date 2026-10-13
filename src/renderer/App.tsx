import { texts } from '../preload/contract/texts';
import styles from './App.module.css';
import { DemoRibbon } from './demo/DemoRibbon';

export function App() {
  return (
    <>
      {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
      <main className={styles.main}>
        <h1 className={styles.name}>{texts.appName}</h1>
      </main>
    </>
  );
}
