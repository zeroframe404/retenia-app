import { useCallback, useState } from 'react';
import { texts } from '../../preload/contract/texts';
import { ImproveSection } from '../progress/ImproveSection';
import { MistakesSection } from '../progress/MistakesSection';
import { ObjectiveForm } from '../progress/ObjectiveForm';
import { ObjectivesSection } from '../progress/ObjectivesSection';
import styles from '../progress/Progress.module.css';
import { ReviewsSection } from '../progress/ReviewsSection';
import { Boton } from '../ui/Boton';
import { ScreenFrame, SectionTabs } from '../ui/Frame';

export type ProgressSectionName = 'objectives' | 'mistakes' | 'improve' | 'reviews';

export interface ObjectiveRequest {
  objectiveId: string;
  nonce: number;
}

// Progreso (Fases 10 y 17): «Objetivos» (por tema, con «Nuevo objetivo» y el panel de cada uno),
// «Mis errores», «Mejorar la tarjeta» y «Dudas y revisiones».
export function ProgressScreen({
  focusTitle,
  subjectId,
  section,
  onSectionChange,
  objectiveRequest,
  onOpenCard,
  onPractice,
  onEditCard,
  onOpenOriginal,
  onGoToStudy,
}: {
  focusTitle: boolean;
  // La materia que se mira (la activa, si no se mira otra).
  subjectId: string | null;
  section: ProgressSectionName;
  onSectionChange: (section: ProgressSectionName) => void;
  objectiveRequest: ObjectiveRequest | null;
  onOpenCard: (subjectId: string | null, cardId: string) => void;
  onPractice: (cardId: string) => void;
  onEditCard: (cardId: string, improve: 'rephrase' | 'hint') => void;
  onOpenOriginal: (cardId: string) => void;
  onGoToStudy: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  // «Ir al requisito» abre el panel de ese objetivo una sola vez por pedido.
  const [handled, setHandled] = useState(0);
  const openId =
    objectiveRequest !== null && objectiveRequest.nonce !== handled
      ? objectiveRequest.objectiveId
      : null;
  const onOpenHandled = useCallback(() => {
    if (objectiveRequest !== null) {
      setHandled(objectiveRequest.nonce);
    }
  }, [objectiveRequest]);

  const sections: { value: ProgressSectionName; text: string }[] = [
    { value: 'objectives', text: texts.progress.objectives },
    { value: 'mistakes', text: texts.progress.mistakes },
    { value: 'improve', text: texts.progress.improve },
    { value: 'reviews', text: texts.progress.reviews },
  ];

  return (
    <ScreenFrame
      title={texts.nav.progress}
      focusTitle={focusTitle}
      actions={
        <div className={styles.actions}>
          {subjectId === null ? null : (
            <Boton onClick={() => setCreating(true)}>{texts.progress.newObjective}</Boton>
          )}
          <Boton variant="primary" onClick={onGoToStudy}>
            {texts.progress.goToStudy}
          </Boton>
        </div>
      }
    >
      <SectionTabs
        label={texts.progress.sectionsLabel}
        sections={sections}
        current={section}
        onChange={onSectionChange}
      />
      {section === 'objectives' ? (
        <ObjectivesSection
          subjectId={subjectId}
          reload={reload}
          openId={openId}
          onOpenHandled={onOpenHandled}
          notice={notice}
          onPractice={onPractice}
        />
      ) : null}
      {section === 'mistakes' ? (
        <MistakesSection
          subjectId={subjectId}
          onPractice={onPractice}
          onOpenCard={(cardId) => onOpenCard(subjectId, cardId)}
        />
      ) : null}
      {section === 'improve' ? (
        <ImproveSection subjectId={subjectId} onEdit={onEditCard} onOpenOriginal={onOpenOriginal} />
      ) : null}
      {section === 'reviews' ? <ReviewsSection onOpenCard={onOpenCard} /> : null}
      {creating && subjectId !== null ? (
        <ObjectiveForm
          subjectId={subjectId}
          onClose={() => setCreating(false)}
          onCreated={(title, observable) => {
            setCreating(false);
            onSectionChange('objectives');
            setReload((n) => n + 1);
            // El objetivo nuevo queda en la lista; si el texto no empieza con una acción, se avisa.
            setNotice(
              observable
                ? texts.progress.form.created(title)
                : `${texts.progress.form.created(title)} ${texts.progress.form.notObservable}`,
            );
          }}
        />
      ) : null}
    </ScreenFrame>
  );
}
