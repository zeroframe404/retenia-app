import { useId, useRef, useState } from 'react';
import { inboxCaptureRequest, MAX_INBOX_LENGTH } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';

// «Anotar al vuelo» (Ctrl+Mayús+N): una sola línea y Enter. Queda en la Bandeja sin pedir materia
// ni tema (CA-046); organizarla viene después.
export function CaptureDialog({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: (count: number) => void;
}) {
  const ids = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (working.current) {
      return;
    }
    const parsed = inboxCaptureRequest.safeParse({ text });
    setFailed(false);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.code === 'too_big'
          ? texts.inbox.captureTooLong(MAX_INBOX_LENGTH)
          : texts.inbox.captureRequired,
      );
      field.current?.focus();
      return;
    }
    setError(undefined);
    working.current = true;
    setBusy(true);
    try {
      const { count } = await window.retenia['inbox.capture']({ text: parsed.data.text });
      onCaptured(count);
    } catch {
      setFailed(true);
      working.current = false;
      setBusy(false);
    }
  }

  const errorId = `${ids}-error`;
  return (
    <Dialog title={texts.inbox.captureTitle} onClose={onClose}>
      <form className={form.inline} onSubmit={submit} noValidate>
        <div className={form.field}>
          <label htmlFor={`${ids}-texto`}>{texts.inbox.captureLabel}</label>
          <input
            id={`${ids}-texto`}
            ref={field}
            type="text"
            value={text}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
            }}
          />
          {error ? (
            <p id={errorId} className={form.fieldNotice}>
              {error}
            </p>
          ) : null}
        </div>
        {failed ? <BannerEstado tone="attention">{texts.inbox.captureFailed}</BannerEstado> : null}
        <div className={form.actions}>
          <Boton type="submit" variant="primary" disabled={busy}>
            {texts.inbox.captureSave}
          </Boton>
        </div>
      </form>
    </Dialog>
  );
}
