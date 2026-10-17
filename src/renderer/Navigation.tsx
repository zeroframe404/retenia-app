import { texts } from '../preload/contract/texts';
import styles from './ui.module.css';

// La barra de secciones provisoria: el riel de la Fase 06 la reemplaza. Botones simples, sin
// elementos de lista (las listas de la ventana son solo las de los datos).

export type Screen = 'cards' | 'trash' | 'activity' | 'settings';

const SECTIONS: { screen: Screen; label: string }[] = [
  { screen: 'cards', label: texts.nav.cards },
  { screen: 'trash', label: texts.nav.trash },
  { screen: 'activity', label: texts.nav.activity },
  { screen: 'settings', label: texts.nav.settings },
];

export function Navigation({
  current,
  onChange,
}: {
  current: Screen;
  onChange: (screen: Screen) => void;
}) {
  return (
    <nav aria-label={texts.nav.label} className={styles.nav}>
      {SECTIONS.map(({ screen, label }) => (
        <button
          key={screen}
          type="button"
          className={styles.navButton}
          aria-current={screen === current ? 'page' : undefined}
          onClick={() => onChange(screen)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
