import type { ReactNode } from 'react';
import { texts } from '../../preload/contract/texts';
import { ScreenFrame } from '../ui/Frame';
import { AiSection } from './AiSection';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';

// Ajustes, provisorio: «Apariencia», «Datos y copias», «Inteligencia artificial» (Fase 19) y, solo
// en «Retenia (prueba)», «Demostración» (la decide App con la variante y la pasa armada). Las demás
// secciones llegan en sus fases.
// `onSubjectsChanged`: una importación puede crear una materia (Fase 15).
// `focusAi`: se llegó desde «Configurar» de una función de IA: el foco va a su sección.
export function SettingsScreen({
  demo,
  focusTitle,
  focusAi = false,
  onSubjectsChanged,
}: {
  demo: ReactNode;
  focusTitle?: boolean;
  focusAi?: boolean;
  onSubjectsChanged?: () => void;
}) {
  return (
    <ScreenFrame title={texts.settings.title} focusTitle={(focusTitle ?? false) && !focusAi}>
      <AppearanceSection />
      <DataSection {...(onSubjectsChanged ? { onSubjectsChanged } : {})} />
      <AiSection focusTitle={focusAi} />
      {demo}
    </ScreenFrame>
  );
}
