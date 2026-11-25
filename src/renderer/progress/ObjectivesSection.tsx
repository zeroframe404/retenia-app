import { useCallback, useEffect, useState } from 'react';
import type { ObjectivesList } from '../../preload/contract/objectives';
import { texts } from '../../preload/contract/texts';
import { ItemList, ListItem } from '../ui/Frame';
import { EstadoDominio } from '../ui/Mastery';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { ObjectivePanel, titleOf } from './ObjectivePanel';
import styles from './Progress.module.css';

// Progreso › «Objetivos» (CA-143): los objetivos de la materia por tema, cada uno con su tipo y su
// estado; el implícito «Recordar: tema» va primero. Tocar uno abre su panel.
export function ObjectivesSection({
  subjectId,
  reload,
  openId,
  onOpenHandled,
  notice,
  onPractice,
}: {
  subjectId: string | null;
  // Cambia cuando hay que volver a leer (se creó un objetivo).
  reload: number;
  // Un objetivo para abrir de entrada («Ir al requisito», un objetivo recién creado).
  openId: string | null;
  onOpenHandled: () => void;
  notice: string;
  onPractice: (cardId: string) => void;
}) {
  const [list, setList] = useState<ObjectivesList | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await window.retenia['objectives.list'](subjectId === null ? {} : { subjectId }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [subjectId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` vuelve a leer la lista.
  useEffect(() => {
    void load();
  }, [load, reload]);

  useEffect(() => {
    if (openId !== null) {
      setOpen(openId);
      onOpenHandled();
    }
  }, [openId, onOpenHandled]);

  if (failed) {
    return (
      <ViewState
        kind="error"
        phrase={texts.progress.objectivesFailed}
        action={{ text: texts.progress.retry, onClick: () => void load() }}
      />
    );
  }
  if (list === null) {
    return <ViewState kind="loading" phrase={texts.progress.loadingObjectives} />;
  }
  if (list.subject === null) {
    return <ViewState kind="empty" phrase={texts.progress.noSubject} />;
  }
  const subject = list.subject;
  return (
    <div className={styles.section}>
      {notice === '' ? null : <BannerEstado tone="info">{notice}</BannerEstado>}
      <h3 className={styles.subjectTitle}>{texts.progress.objectivesOf(subject.name)}</h3>
      {list.topics.length === 0 ? (
        <p className={styles.note}>{texts.progress.noObjectives}</p>
      ) : (
        list.topics.map((topic) => {
          const name = topic.name ?? texts.progress.noTopic;
          return (
            <section
              key={topic.topicId ?? 'sin-tema'}
              className={styles.group}
              aria-label={texts.progress.topicObjectives(name)}
            >
              <h3>{name}</h3>
              <ItemList label={texts.progress.topicObjectives(name)}>
                {topic.objectives.map((objective) => (
                  <ListItem
                    key={objective.id}
                    title={titleOf(objective)}
                    onOpen={() => setOpen(objective.id)}
                  >
                    <div className={styles.row}>
                      <EstadoDominio state={objective.state} toVerify={objective.toVerify} />
                      <span className={styles.tag}>{texts.progress.kinds[objective.kind]}</span>
                      <span className={styles.note}>
                        {texts.progress.activityCount(objective.activityCount)}
                      </span>
                      {objective.postponed ? (
                        <span className={styles.tag}>{texts.progress.postponedTag}</span>
                      ) : null}
                    </div>
                  </ListItem>
                ))}
              </ItemList>
            </section>
          );
        })
      )}
      {open === null ? null : (
        <ObjectivePanel
          objectiveId={open}
          subjectId={subject.id}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
          onPractice={(cardId) => {
            setOpen(null);
            onPractice(cardId);
          }}
        />
      )}
    </div>
  );
}
