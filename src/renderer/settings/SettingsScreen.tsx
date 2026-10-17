import type { ReactNode } from 'react';
import { texts } from '../../preload/contract/texts';
import { ScreenFrame } from '../ui/Frame';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';

// Ajustes, provisorio: «Apariencia», «Datos y copias» y, solo en «Retenia (prueba)»,
// «Demostración» (la decide App con la variante y la pasa armada). Las demás secciones llegan en
// sus fases.
export function SettingsScreen({ demo, focusTitle }: { demo: ReactNode; focusTitle?: boolean }) {
  return (
    <ScreenFrame title={texts.settings.title} focusTitle={focusTitle ?? false}>
      <AppearanceSection />
      <DataSection />
      {demo}
    </ScreenFrame>
  );
}
