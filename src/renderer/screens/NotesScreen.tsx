import { useState } from 'react';
import { texts } from '../../preload/contract/texts';
import { ActivityScreen } from '../activity/ActivityScreen';
import { CardsScreen } from '../cards/CardsScreen';
import { TrashScreen } from '../trash/TrashScreen';
import { ScreenFrame, SectionTabs } from '../ui/Frame';

type Section = 'cards' | 'trash' | 'activity';

const SECTIONS: readonly { value: Section; text: string }[] = [
  { value: 'cards', text: texts.notes.cards },
  { value: 'trash', text: texts.notes.trash },
  { value: 'activity', text: texts.notes.activity },
];

// Apuntes. Por ahora lleva adentro lo que ya existe de la Fase 03 y la 04 (la lista de tarjetas
// provisoria, la Papelera y la Actividad reciente); los temas, las notas y la Bandeja llegan en la
// Fase 07.
export function NotesScreen({ focusTitle }: { focusTitle?: boolean }) {
  const [section, setSection] = useState<Section>('cards');
  return (
    <ScreenFrame title={texts.nav.notes} focusTitle={focusTitle ?? false}>
      <SectionTabs
        label={texts.notes.tabsLabel}
        sections={SECTIONS}
        current={section}
        onChange={setSection}
      />
      {section === 'cards' ? <CardsScreen /> : null}
      {section === 'trash' ? <TrashScreen onBackToCards={() => setSection('cards')} /> : null}
      {section === 'activity' ? <ActivityScreen onBackToCards={() => setSection('cards')} /> : null}
    </ScreenFrame>
  );
}
