import { useCallback, useEffect, useId, useState } from 'react';
import type { MistakeTypeValue, ProgressErrors } from '../../preload/contract/objectives';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import styles from './Progress.module.css';

const TYPES: readonly MistakeTypeValue[] = [
  'distraction',
  'forgotten',
  'confusion',
  'calculation',
  'missingIdea',
  'stepOrder',
  'other',
];

function TypeChoice({
  value,
  onChange,
}: {
  value: MistakeTypeValue;
  onChange: (type: MistakeTypeValue) => void;
}) {
  const id = useId();
  return (
    <div className={styles.check}>
      <label htmlFor={id}>{texts.progress.mistakesSection.type}</label>
      <select
        id={id}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value as MistakeTypeValue)}
      >
        {TYPES.map((type) => (
          <option key={type} value={type}>
            {texts.progress.mistakesSection.types[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

// Progreso › «Mis errores» (CA-155): lo que escribiste tal cual, la respuesta correcta y el tipo de
// error (lo propone una regla; lo podés cambiar), agrupados por tema.
export function MistakesSection({
  subjectId,
  onPractice,
}: {
  subjectId: string | null;
  onPractice: (cardId: string) => void;
}) {
  const [errors, setErrors] = useState<ProgressErrors | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState('');
  const text = texts.progress.mistakesSection;

  const load = useCallback(async () => {
    try {
      setErrors(await window.retenia['progress.errors'](subjectId === null ? {} : { subjectId }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setType(attemptId: string, type: MistakeTypeValue) {
    try {
      await window.retenia['progress.errors.setType']({ attemptId, type });
      setToast(text.typeSaved);
      await load();
    } catch {
      setToast(texts.progress.panel.failed);
    }
  }

  if (failed) {
    return (
      <ViewState
        kind="error"
        phrase={text.loadFailed}
        action={{ text: texts.progress.retry, onClick: () => void load() }}
      />
    );
  }
  if (errors === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  return (
    <div className={styles.section}>
      <Toast>{toast}</Toast>
      {errors.groups.length === 0 ? (
        <ViewState kind="empty" phrase={text.empty} />
      ) : (
        errors.groups.map((group) => {
          const name = group.topicName ?? texts.progress.noTopic;
          return (
            <section
              key={group.topicId ?? 'sin-tema'}
              className={styles.group}
              aria-label={text.groupLabel(name)}
            >
              <h3>{name}</h3>
              <ItemList label={text.groupLabel(name)}>
                {group.items.map((item) => (
                  <ListItem
                    key={item.attemptId}
                    title={item.question}
                    detail={text.on(formatShortDate(item.day))}
                    actions={
                      item.practicable ? (
                        <Boton variant="quiet" onClick={() => onPractice(item.cardId)}>
                          {text.practice}
                        </Boton>
                      ) : null
                    }
                  >
                    <p>{text.yourAnswer(item.written)}</p>
                    <p>{text.correct(item.correct)}</p>
                    <TypeChoice
                      value={item.type}
                      onChange={(type) => void setType(item.attemptId, type)}
                    />
                  </ListItem>
                ))}
              </ItemList>
            </section>
          );
        })
      )}
    </div>
  );
}
