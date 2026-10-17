import { useState } from 'react';
import { texts } from '../preload/contract/texts';
import styles from './App.module.css';
import { ActivityScreen } from './activity/ActivityScreen';
import { CardsScreen } from './cards/CardsScreen';
import { DemoRibbon } from './demo/DemoRibbon';
import { DemoSection } from './demo/DemoSection';
import { Navigation, type Screen } from './Navigation';
import { SettingsScreen } from './settings/SettingsScreen';
import { TrashScreen } from './trash/TrashScreen';

export function App() {
  const [screen, setScreen] = useState<Screen>('cards');
  return (
    <>
      {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
      <main className={styles.main}>
        <h1 className={styles.name}>{texts.appName}</h1>
        <Navigation current={screen} onChange={setScreen} />
        {screen === 'cards' ? <CardsScreen /> : null}
        {screen === 'trash' ? <TrashScreen /> : null}
        {screen === 'activity' ? <ActivityScreen /> : null}
        {screen === 'settings' ? (
          <SettingsScreen demo={__VARIANTE__ === 'prueba' ? <DemoSection /> : null} />
        ) : null}
      </main>
    </>
  );
}
