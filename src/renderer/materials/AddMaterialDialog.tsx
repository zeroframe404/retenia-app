import { type DragEvent, useId, useState } from 'react';
import type { AddResult } from '../../preload/contract/materials';
import { MAX_PASTED_TEXT } from '../../preload/contract/materials';
import type { Subject } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Materials.module.css';

export type AddMode = 'files' | 'paste';

// «Agregar material» (H-25): arrastrar archivos, «Elegir archivo» o «Pegar texto». La materia
// activa viene preseleccionada y «Más opciones» (el título) queda plegado.
export function AddMaterialDialog({
  subjects,
  defaultSubjectId,
  initialMode = 'files',
  onClose,
  onAdded,
}: {
  subjects: readonly Subject[];
  defaultSubjectId: string | null;
  initialMode?: AddMode;
  onClose: () => void;
  onAdded: (results: AddResult[]) => void;
}) {
  const ids = useId();
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? subjects[0]?.id ?? '');
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: File[]) {
    if (files.length === 0 || busy || !window.reteniaArchivos) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const { results } = await window.reteniaArchivos.agregar(files, {
        subjectId,
        title: title.trim() || undefined,
      });
      onAdded(results);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  async function addText() {
    if (text.trim() === '' || busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const result = await window.retenia['materials.addText']({
        subjectId,
        text: text.slice(0, MAX_PASTED_TEXT),
        title: title.trim() || undefined,
      });
      onAdded([result]);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const onDrop = (event: DragEvent<HTMLFieldSetElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <Dialog title={texts.materials.add} onClose={onClose}>
      <div className={styles.addForm}>
        <div className={form.field}>
          <label htmlFor={`${ids}-materia`}>{texts.materials.subject}</label>
          <select
            id={`${ids}-materia`}
            className={styles.select}
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        {mode === 'files' ? (
          <fieldset
            className={styles.dropZone}
            data-dragging={dragging}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <legend className={styles.dropText}>{texts.materials.dropHere}</legend>
            <div className={styles.actions}>
              <label className={styles.fileButton}>
                <input
                  type="file"
                  multiple
                  className={styles.fileInput}
                  disabled={busy}
                  onChange={(event) => {
                    const chosen = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    void addFiles(chosen);
                  }}
                />
                <span>{texts.materials.chooseFile}</span>
              </label>
              <Boton onClick={() => setMode('paste')}>{texts.materials.pasteText}</Boton>
            </div>
          </fieldset>
        ) : (
          <div className={form.field}>
            <label htmlFor={`${ids}-texto`}>{texts.materials.textLabel}</label>
            <textarea
              id={`${ids}-texto`}
              rows={8}
              value={text}
              autoFocus
              maxLength={MAX_PASTED_TEXT}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        )}
        <div className={styles.more}>
          <button
            type="button"
            className={styles.moreToggle}
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
          >
            {texts.materials.moreOptions}
          </button>
          {more ? (
            <div className={form.field}>
              <label htmlFor={`${ids}-titulo`}>{texts.materials.titleOptional}</label>
              <input
                id={`${ids}-titulo`}
                type="text"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          ) : null}
        </div>
        {failed ? (
          <BannerEstado tone="info">{texts.materials.problems.copyFailed}</BannerEstado>
        ) : null}
        {mode === 'paste' ? (
          <div className={styles.actions}>
            <Boton variant="primary" busy={busy} onClick={() => void addText()}>
              {texts.materials.addText}
            </Boton>
            <Boton onClick={() => setMode('files')}>{texts.materials.chooseFile}</Boton>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
