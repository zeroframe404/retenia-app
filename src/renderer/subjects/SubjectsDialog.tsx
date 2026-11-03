import { useEffect, useId, useRef, useState } from 'react';
import {
  MAX_NAME_LENGTH,
  type Subject,
  subjectsCreateRequest,
} from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { sameName } from '../names';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { Dialog, ItemList, ListItem, Toast } from '../ui/Frame';
import { EtiquetaEjemplo } from '../ui/Labels';
import { BannerEstado } from '../ui/Process';
import styles from './Subjects.module.css';

// «Cambiar»: la lista de materias con su estado. «Abrir» las mira sin activarlas (CA-039), «Hacer
// activa» cambia la activa (CA-038) y «Nueva materia» crea una en mantenimiento. El cuadro queda
// abierto después de activar: la lista se actualiza en el lugar.
export function SubjectsDialog({
  subjects,
  onClose,
  onChanged,
  onOpen,
}: {
  subjects: readonly Subject[];
  onClose: () => void;
  onChanged: (subjects: Subject[]) => void;
  onOpen: (subject: Subject) => void;
}) {
  const ids = useId();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [focusList, setFocusList] = useState(0);

  // El campo recibe el foco al abrir el formulario; al cerrarlo, «Nueva materia» recupera el suyo.
  const wasCreating = useRef(false);
  useEffect(() => {
    if (creating) {
      field.current?.focus();
    } else if (wasCreating.current) {
      newButton.current?.querySelector('button')?.focus();
    }
    wasCreating.current = creating;
  }, [creating]);

  // Después de «Hacer activa» el botón que se tocó ya no está: el foco pasa al primer renglón.
  useEffect(() => {
    if (focusList > 0) {
      list.current?.querySelector('button')?.focus();
    }
  }, [focusList]);

  async function run(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setFailed(false);
    setNotice('');
    try {
      await task();
    } catch {
      setFailed(true);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function create(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (working.current) {
      return;
    }
    const parsed = subjectsCreateRequest.safeParse({ name, makeActive: false });
    let problem: string | undefined;
    if (!parsed.success) {
      problem =
        parsed.error.issues[0]?.code === 'too_big'
          ? texts.subjects.nameTooLong(MAX_NAME_LENGTH)
          : texts.subjects.nameRequired;
    } else if (subjects.some((subject) => sameName(subject.name, parsed.data.name))) {
      problem = texts.subjects.nameTaken;
    }
    setError(problem);
    if (!parsed.success || problem !== undefined) {
      field.current?.focus();
      return;
    }
    await run(async () => {
      await window.retenia['subjects.create']({ name: parsed.data.name, makeActive: false });
      onChanged((await window.retenia['subjects.list']({})).subjects);
      setName('');
      setCreating(false);
    });
  }

  const activate = (subject: Subject) =>
    run(async () => {
      const { subjects: fresh } = await window.retenia['subjects.activate']({
        subjectId: subject.id,
      });
      onChanged(fresh);
      setNotice(texts.subjects.activated(subject.name));
      setFocusList((tick) => tick + 1);
    });

  const errorId = `${ids}-nombre-error`;
  return (
    <Dialog title={texts.subjects.dialogTitle} onClose={onClose}>
      <div className={styles.dialogBody}>
        <Toast>{notice}</Toast>
        {failed ? <BannerEstado tone="attention">{texts.subjects.failed}</BannerEstado> : null}
        {creating ? (
          <form className={form.inline} onSubmit={create} noValidate>
            <div className={form.field}>
              <label htmlFor={`${ids}-nombre`}>{texts.subjects.nameLabel}</label>
              <input
                id={`${ids}-nombre`}
                ref={field}
                type="text"
                value={name}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
              {error ? (
                <p id={errorId} className={form.fieldNotice}>
                  {error}
                </p>
              ) : null}
            </div>
            <div className={form.actions}>
              <Boton type="submit" variant="primary" disabled={busy}>
                {texts.subjects.create}
              </Boton>
              <Boton
                onClick={() => {
                  setCreating(false);
                  setError(undefined);
                  setName('');
                }}
              >
                {texts.subjects.cancel}
              </Boton>
            </div>
          </form>
        ) : (
          <div ref={newButton}>
            <Boton onClick={() => setCreating(true)}>{texts.subjects.newSubject}</Boton>
          </div>
        )}
        <div ref={list}>
          <ItemList label={texts.subjects.listLabel}>
            {subjects.map((subject) => (
              <ListItem
                key={subject.id}
                title={subject.name}
                detail={texts.subjects.status[subject.status]}
                actions={
                  <>
                    <Boton disabled={busy} onClick={() => onOpen(subject)}>
                      {texts.subjects.open}
                    </Boton>
                    {subject.status === 'active' ? null : (
                      <Boton disabled={busy} onClick={() => void activate(subject)}>
                        {texts.subjects.makeActive}
                      </Boton>
                    )}
                  </>
                }
              >
                {subject.isExample ? <EtiquetaEjemplo /> : null}
              </ListItem>
            ))}
          </ItemList>
        </div>
      </div>
    </Dialog>
  );
}
