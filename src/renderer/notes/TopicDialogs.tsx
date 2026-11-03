import { type RefObject, useId, useRef, useState } from 'react';
import {
  MAX_NAME_LENGTH,
  type Topic,
  topicsCreateRequest,
} from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { sameName } from '../names';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { Dialog, ItemList, ListItem } from '../ui/Frame';
import styles from './Notes.module.css';

// El nombre de un tema: no vacío, no larguísimo y que no repita el de otro tema de la materia (sin
// distinguir mayúsculas ni espacios). Devuelve el nombre ya recortado o el aviso del campo.
function checkName(
  raw: string,
  others: readonly Topic[],
  selfId?: string,
): { name: string } | { problem: string } {
  const parsed = topicsCreateRequest.shape.name.safeParse(raw);
  if (!parsed.success) {
    return {
      problem:
        parsed.error.issues[0]?.code === 'too_big'
          ? texts.notes.topics.nameTooLong(MAX_NAME_LENGTH)
          : texts.notes.topics.nameRequired,
    };
  }
  const taken = others.some((topic) => topic.id !== selfId && sameName(topic.name, parsed.data));
  return taken ? { problem: texts.notes.topics.nameTaken } : { name: parsed.data };
}

// El campo «Nombre del tema» con su aviso, compartido por «Nuevo tema» y «Renombrar».
function NameField({
  value,
  error,
  onChange,
  inputRef,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const ids = useId();
  const errorId = `${ids}-error`;
  return (
    <div className={form.field}>
      <label htmlFor={`${ids}-nombre`}>{texts.notes.topics.nameLabel}</label>
      <input
        id={`${ids}-nombre`}
        ref={inputRef}
        type="text"
        value={value}
        // biome-ignore lint/a11y/noAutofocus: el campo aparece para escribir enseguida.
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className={form.fieldNotice}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// «Nuevo tema»: un campo y «Crear» / «Cancelar». Enter crea.
export function NewTopicForm({
  topics,
  onCreate,
  onCancel,
}: {
  topics: readonly Topic[];
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const field = useRef<HTMLInputElement>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const checked = checkName(name, topics);
    if ('problem' in checked) {
      setError(checked.problem);
      field.current?.focus();
      return;
    }
    await onCreate(checked.name);
  }

  return (
    <form className={form.inline} onSubmit={submit} noValidate>
      <NameField
        value={name}
        error={error}
        inputRef={field}
        onChange={(value) => {
          setName(value);
          setError(undefined);
        }}
      />
      <div className={form.actions}>
        <Boton type="submit">{texts.notes.topics.create}</Boton>
        <Boton onClick={onCancel}>{texts.notes.topics.cancel}</Boton>
      </div>
    </form>
  );
}

// «Renombrar»: el campo arranca con el nombre actual. Al guardar, el nombre viejo queda en «Otros
// nombres».
export function RenameTopicDialog({
  topic,
  topics,
  onRename,
  onClose,
}: {
  topic: Topic;
  topics: readonly Topic[];
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(topic.name);
  const [error, setError] = useState<string | undefined>();
  const field = useRef<HTMLInputElement>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const checked = checkName(name, topics, topic.id);
    if ('problem' in checked) {
      setError(checked.problem);
      field.current?.focus();
      return;
    }
    await onRename(checked.name);
  }

  return (
    <Dialog title={texts.notes.topics.renameTitle} onClose={onClose}>
      <form className={form.inline} onSubmit={submit} noValidate>
        <NameField
          value={name}
          error={error}
          inputRef={field}
          onChange={(value) => {
            setName(value);
            setError(undefined);
          }}
        />
        <div className={form.actions}>
          <Boton type="submit" variant="primary">
            {texts.notes.topics.save}
          </Boton>
        </div>
      </form>
    </Dialog>
  );
}

// «Detalles»: cuántas notas tiene y qué otros nombres tuvo (CA-044).
export function TopicDetailsDialog({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  return (
    <Dialog title={texts.notes.topics.detailsTitle(topic.name)} onClose={onClose}>
      <p className={styles.dialogText}>{texts.notes.topics.notesCount(topic.noteCount)}</p>
      <div className={styles.group}>
        <h3 className={styles.dialogHeading}>{texts.notes.topics.otherNames}</h3>
        {topic.aliases.length === 0 ? (
          <p className={styles.dialogText}>{texts.notes.topics.noOtherNames}</p>
        ) : (
          <ItemList label={texts.notes.topics.otherNames}>
            {topic.aliases.map((alias) => (
              <ListItem key={alias} text={alias} />
            ))}
          </ItemList>
        )}
      </div>
    </Dialog>
  );
}
