import type { Subject } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { ActivityScreen } from '../activity/ActivityScreen';
import { CardsScreen } from '../cards/CardsScreen';
import { InboxSection } from '../inbox/InboxSection';
import { NotesSection } from '../notes/NotesSection';
import { ViewedSubject } from '../subjects/SubjectBar';
import { TrashScreen } from '../trash/TrashScreen';
import { ScreenFrame, SectionTabs } from '../ui/Frame';

export type NotesSectionName = 'notes' | 'inbox' | 'cards' | 'trash' | 'activity';

// Apuntes: arriba, la materia que se mira y la activa; después las secciones. «Notas» es la de
// entrada; «Tarjetas» es la pantalla provisoria de la Fase 03.
export function NotesScreen({
  focusTitle,
  subject,
  active,
  section,
  onSectionChange,
  inboxCount,
  onInboxCount,
  onChangeSubject,
  onViewSubject,
  onDataChanged,
}: {
  focusTitle?: boolean;
  subject: Subject;
  active: Subject | null;
  section: NotesSectionName;
  onSectionChange: (section: NotesSectionName) => void;
  inboxCount: number;
  onInboxCount: (count: number) => void;
  onChangeSubject: () => void;
  onViewSubject: (subjectId: string) => void;
  // Algo que cambia lo que muestra el resto de la ventana (la materia activa, la Bandeja).
  onDataChanged: () => void;
}) {
  const sections = [
    { value: 'notes', text: texts.notes.notesTab },
    {
      value: 'inbox',
      text: texts.notes.inboxTab,
      count: inboxCount > 0 ? inboxCount : undefined,
    },
    { value: 'cards', text: texts.notes.cards },
    { value: 'trash', text: texts.notes.trash },
    { value: 'activity', text: texts.notes.activity },
  ] as const;
  const toCards = () => onSectionChange('cards');
  return (
    <ScreenFrame title={texts.nav.notes} focusTitle={focusTitle ?? false}>
      <ViewedSubject viewed={subject} active={active} onChange={onChangeSubject} />
      <SectionTabs
        label={texts.notes.tabsLabel}
        sections={sections}
        current={section}
        onChange={onSectionChange}
      />
      {section === 'notes' ? (
        <NotesSection subject={subject} onViewSubject={onViewSubject} />
      ) : null}
      {section === 'inbox' ? (
        <InboxSection subjectId={subject.id} count={inboxCount} onCount={onInboxCount} />
      ) : null}
      {section === 'cards' ? <CardsScreen /> : null}
      {section === 'trash' ? (
        <TrashScreen onBackToCards={toCards} onChanged={onDataChanged} />
      ) : null}
      {section === 'activity' ? (
        <ActivityScreen onBackToCards={toCards} onChanged={onDataChanged} />
      ) : null}
    </ScreenFrame>
  );
}
