import type { ReactNode } from 'react';
import { texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';
import { DataSection } from './DataSection';

// Ajustes, provisorio: «Datos y copias» y, solo en «Retenia (prueba)», «Demostración» (la decide
// App con la variante y la pasa armada). Las demás secciones llegan en sus fases.
export function SettingsScreen({ demo }: { demo: ReactNode }) {
  return (
    <section className={styles.screen} aria-labelledby="titulo-ajustes">
      <div className={styles.header}>
        <h2 id="titulo-ajustes">{texts.settings.title}</h2>
      </div>
      <DataSection />
      {demo}
    </section>
  );
}
