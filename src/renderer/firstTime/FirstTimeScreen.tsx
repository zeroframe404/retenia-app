import { useId, useRef, useState } from 'react';
import {
  MAX_NAME_LENGTH,
  type Subject,
  subjectsCreateRequest,
} from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { DemoFirstTimeExit } from '../demo/DemoFirstTimeExit';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import type { Destination } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './FirstTime.module.css';

// La primera vez (CA-041): sin ninguna materia, una sola pregunta. Escribirla y apretar Enter (o
// «Agregar mi primer material») crea la materia activa y lleva a Materiales, que sigue vacío;
// «Probar con un ejemplo (3 min)» carga la materia de ejemplo y lleva a Estudiar. No se pide nada
// más.
export function FirstTimeScreen({
  onCreated,
  onDataChanged,
}: {
  onCreated: (subject: Subject, destination: Destination) => void;
  onDataChanged: () => void;
}) {
  const ids = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  async function create(request: () => Promise<Subject>, destination: Destination) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setFailed(false);
    try {
      onCreated(await request(), destination);
    } catch {
      setFailed(true);
      working.current = false;
      setBusy(false);
    }
  }

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (working.current) {
      return;
    }
    const parsed = subjectsCreateRequest.safeParse({ name, makeActive: true });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.code === 'too_big'
          ? texts.firstTime.nameTooLong(MAX_NAME_LENGTH)
          : texts.firstTime.nameRequired,
      );
      field.current?.focus();
      return;
    }
    setError(undefined);
    await create(
      () => window.retenia['subjects.create']({ name: parsed.data.name, makeActive: true }),
      'materials',
    );
  }

  const errorId = `${ids}-error`;
  return (
    <main className={styles.page} aria-label={texts.appName}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <h1 className={styles.title}>{texts.appName}</h1>
        <div className={form.field}>
          <label className={styles.question} htmlFor={`${ids}-pregunta`}>
            {texts.firstTime.question}
          </label>
          <input
            id={`${ids}-pregunta`}
            ref={field}
            type="text"
            value={name}
            // biome-ignore lint/a11y/noAutofocus: es lo único que se pide: se escribe enseguida.
            autoFocus
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
        {failed ? <BannerEstado tone="attention">{texts.firstTime.failed}</BannerEstado> : null}
        <div className={form.actions}>
          <Boton type="submit" variant="primary" disabled={busy}>
            {texts.firstTime.addMaterial}
          </Boton>
          <Boton
            disabled={busy}
            onClick={() => void create(() => window.retenia['subjects.createExample']({}), 'study')}
          >
            {texts.firstTime.tryExample}
          </Boton>
        </div>
        {__VARIANTE__ === 'prueba' ? <DemoFirstTimeExit onDataChanged={onDataChanged} /> : null}
      </form>
    </main>
  );
}
