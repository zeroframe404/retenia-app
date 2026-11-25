import { useEffect, useId, useRef, useState } from 'react';
import type { ObjectiveKindValue } from '../../preload/contract/objectives';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { ActivityChoices, useActivities } from './ActivityChoices';
import styles from './Progress.module.css';

const KINDS: readonly ObjectiveKindValue[] = [
  'remember',
  'understand',
  'apply',
  'reason',
  'execute',
];

// «Nuevo objetivo» (CA-143): el tema, el texto (lo que vas a poder hacer), las condiciones, el tipo
// y las actividades que pasan a este objetivo.
export function ObjectiveForm({
  subjectId,
  onClose,
  onCreated,
}: {
  subjectId: string;
  onClose: () => void;
  onCreated: (title: string, observable: boolean) => void;
}) {
  const ids = useId();
  const [objectiveId] = useState(() => crypto.randomUUID());
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [topicId, setTopicId] = useState('');
  const [text, setText] = useState('');
  const [conditions, setConditions] = useState('');
  const [kind, setKind] = useState<ObjectiveKindValue>('remember');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState('');
  const sending = useRef(false);
  const activities = useActivities(subjectId, topicId === '' ? null : topicId);

  useEffect(() => {
    let live = true;
    window.retenia['topics.list']({ subjectId }).then(
      (loaded) => {
        if (live) {
          setTopics(loaded.topics.map((topic) => ({ id: topic.id, name: topic.name })));
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [subjectId]);

  async function create() {
    if (sending.current) {
      return;
    }
    if (text.trim() === '') {
      setProblem(texts.progress.form.textRequired);
      return;
    }
    sending.current = true;
    setProblem('');
    try {
      const created = await window.retenia['objectives.create']({
        objectiveId,
        subjectId,
        topicId: topicId === '' ? null : topicId,
        text: text.trim(),
        conditions: conditions.trim() === '' ? null : conditions.trim(),
        kind,
        cardIds: [...chosen],
      });
      onCreated(text.trim(), created.observable);
    } catch {
      setProblem(texts.progress.form.failed);
      sending.current = false;
    }
  }

  return (
    <Dialog title={texts.progress.form.title} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className={styles.field}>
          <label htmlFor={`${ids}-tema`}>{texts.progress.form.topic}</label>
          <select
            id={`${ids}-tema`}
            className={`${styles.input} ${styles.select}`}
            value={topicId}
            onChange={(event) => {
              setTopicId(event.target.value);
              setChosen(new Set());
            }}
          >
            <option value="">{texts.progress.noTopic}</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${ids}-texto`}>{texts.progress.form.text}</label>
          <input
            id={`${ids}-texto`}
            className={styles.input}
            type="text"
            maxLength={200}
            value={text}
            aria-describedby={`${ids}-texto-ayuda`}
            onChange={(event) => setText(event.target.value)}
          />
          <p id={`${ids}-texto-ayuda`} className={styles.help}>
            {texts.progress.form.textHelp}
          </p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${ids}-condiciones`}>{texts.progress.form.conditions}</label>
          <input
            id={`${ids}-condiciones`}
            className={styles.input}
            type="text"
            maxLength={300}
            value={conditions}
            aria-describedby={`${ids}-condiciones-ayuda`}
            onChange={(event) => setConditions(event.target.value)}
          />
          <p id={`${ids}-condiciones-ayuda`} className={styles.help}>
            {texts.progress.form.conditionsHelp}
          </p>
        </div>
        <OptionGroup
          legend={texts.progress.form.kind}
          options={KINDS.map((value) => ({ value, text: texts.progress.kinds[value] }))}
          value={kind}
          onChange={setKind}
        />
        <ActivityChoices
          legend={texts.progress.form.activities}
          help={texts.progress.form.activitiesHelp}
          activities={activities}
          chosen={chosen}
          onChange={setChosen}
        />
        {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
        <div className={styles.actions}>
          <Boton variant="primary" type="submit">
            {texts.progress.form.create}
          </Boton>
          <Boton variant="quiet" onClick={onClose}>
            {texts.progress.form.cancel}
          </Boton>
        </div>
      </form>
    </Dialog>
  );
}
