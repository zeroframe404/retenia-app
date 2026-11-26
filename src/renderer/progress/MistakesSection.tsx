import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MistakeTypeValue, ProgressErrors } from '../../preload/contract/objectives';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog, ItemList, ListItem, Toast } from '../ui/Frame';
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

// Cuando los dos conceptos no se pueden sacar del error: los escribís vos.
function ContrastDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: { first: string; second: string };
  onClose: () => void;
  onSave: (concepts: [string, string]) => void;
}) {
  const ids = useId();
  const [first, setFirst] = useState(initial.first);
  const [second, setSecond] = useState(initial.second);
  const text = texts.progress.contrast;
  const ready = first.trim() !== '' && second.trim() !== '';
  return (
    <Dialog title={text.title} onClose={onClose}>
      <form
        className={styles.section}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) {
            onSave([first.trim(), second.trim()]);
          }
        }}
      >
        <p>{text.help}</p>
        <label htmlFor={`${ids}-uno`}>{text.first}</label>
        <input
          id={`${ids}-uno`}
          className={styles.input}
          type="text"
          maxLength={60}
          value={first}
          onChange={(event) => setFirst(event.target.value)}
        />
        <label htmlFor={`${ids}-dos`}>{text.second}</label>
        <input
          id={`${ids}-dos`}
          className={styles.input}
          type="text"
          maxLength={60}
          value={second}
          onChange={(event) => setSecond(event.target.value)}
        />
        {ready ? <p>{text.preview(text.question(first.trim(), second.trim()))}</p> : null}
        <div className={styles.dialogActions}>
          <Boton type="submit" variant="primary" disabled={!ready}>
            {text.save}
          </Boton>
          <Boton onClick={onClose}>{text.cancel}</Boton>
        </div>
      </form>
    </Dialog>
  );
}

// Progreso › «Mis errores» (CA-155): lo que escribiste tal cual, la respuesta correcta y el tipo de
// error (lo propone una regla; lo podés cambiar), agrupados por tema.
export function MistakesSection({
  subjectId,
  onPractice,
  onOpenCard,
}: {
  subjectId: string | null;
  onPractice: (cardId: string) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const [errors, setErrors] = useState<ProgressErrors | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState('');
  // La tarjeta de contraste recién creada (o la que ya estaba), con el error del que salió.
  const [contrast, setContrast] = useState<{
    attemptId: string;
    cardId: string;
    message: string;
  } | null>(null);
  const [asking, setAsking] = useState<{
    attemptId: string;
    first: string;
    second: string;
  } | null>(null);
  const creating = useRef(false);
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
      await window.retenia['progress.errors.setType']({
        changeId: crypto.randomUUID(),
        attemptId,
        type,
      });
      setToast(text.typeSaved);
      await load();
    } catch {
      setToast(texts.progress.panel.failed);
    }
  }

  // «Crear tarjeta de contraste» (CA-163): con los dos conceptos del error o, si no se pueden
  // sacar, con los que escribas.
  async function createContrast(attemptId: string, concepts?: [string, string]) {
    if (creating.current) {
      return;
    }
    creating.current = true;
    setToast('');
    try {
      const response = await window.retenia['progress.errors.contrast']({
        requestId: crypto.randomUUID(),
        attemptId,
        ...(concepts === undefined ? {} : { concepts }),
      });
      if (response.kind === 'needsConcepts') {
        setAsking({ attemptId, first: response.first, second: response.second });
        return;
      }
      setAsking(null);
      const message =
        response.kind === 'created'
          ? texts.progress.contrast.created(response.question)
          : texts.progress.contrast.exists(response.question);
      setContrast({ attemptId, cardId: response.cardId, message });
    } catch {
      setAsking(null);
      setToast(texts.progress.contrast.failed);
    } finally {
      creating.current = false;
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
                      <>
                        {item.type === 'confusion' ? (
                          <Boton onClick={() => void createContrast(item.attemptId)}>
                            {texts.progress.contrast.create}
                          </Boton>
                        ) : null}
                        {item.practicable ? (
                          <Boton variant="quiet" onClick={() => onPractice(item.cardId)}>
                            {text.practice}
                          </Boton>
                        ) : null}
                      </>
                    }
                  >
                    <p>{text.yourAnswer(item.written)}</p>
                    <p>{text.correct(item.correct)}</p>
                    <TypeChoice
                      value={item.type}
                      onChange={(type) => void setType(item.attemptId, type)}
                    />
                    {contrast?.attemptId === item.attemptId ? (
                      <div className={styles.contrast} role="status">
                        <p>{contrast.message}</p>
                        <Boton onClick={() => onOpenCard(contrast.cardId)}>
                          {texts.progress.contrast.open}
                        </Boton>
                      </div>
                    ) : null}
                  </ListItem>
                ))}
              </ItemList>
            </section>
          );
        })
      )}
      {asking === null ? null : (
        <ContrastDialog
          initial={asking}
          onClose={() => setAsking(null)}
          onSave={(concepts) => void createContrast(asking.attemptId, concepts)}
        />
      )}
    </div>
  );
}
