import type { ReactNode } from 'react';
import { texts } from '../../preload/contract/texts';
import { ScreenFrame } from '../ui/Frame';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';

// Ajustes, provisorio: «Apariencia», «Datos y copias» y, solo en «Retenia (prueba)»,
// «Demostración» (la decide App con la variante y la pasa armada). Las demás secciones llegan en
// sus fases.
// `onSubjectsChanged`: una importación puede crear una materia (Fase 15).
export function SettingsScreen({
  demo,
  focusTitle,
  onSubjectsChanged,
}: {
  demo: ReactNode;
  focusTitle?: boolean;
  onSubjectsChanged?: () => void;
}) {
  return (
    <ScreenFrame title={texts.settings.title} focusTitle={focusTitle ?? false}>
      <AppearanceSection />
      <DataSection {...(onSubjectsChanged ? { onSubjectsChanged } : {})} />
      {demo}
    </ScreenFrame>
  );
}
