import { useCallback, useEffect, useId, useState } from 'react';
import type { AiConnection, AiPermissions, AiSentLog, AiStatus } from '../../preload/contract/ai';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import content from '../ui/Content.module.css';
import form from '../ui/Form.module.css';
import { Dialog, ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';

// Ajustes › «Inteligencia artificial» (Fase 19, H-40): la clave (que se guarda cifrada por Windows y
// nunca vuelve a la ventana), «Probar conexión», el tope del mes con su contador, «Modo solo local»,
// el estado de cada función, «Qué se envió» y los materiales con un permiso guardado.

// «10», «2,50», «0,01» o «1.000» → centavos (nulo si no es un monto de USD 0,01 a USD 1.000).
function centsFrom(text: string): number | null {
  const typed = text.trim().replace(/^USD\s*/iu, '');
  let value: number;
  if (/^\d{1,3}(\.\d{3})+$/u.test(typed)) {
    value = Number(typed.replaceAll('.', ''));
  } else if (/^\d+([.,]\d{1,2})?$/u.test(typed)) {
    value = Number(typed.replace(',', '.'));
  } else {
    return null;
  }
  const cents = Math.round(value * 100);
  return cents >= 1 && cents <= 100_000 ? cents : null;
}

const capText = (cents: number) =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');

export function AiSection({ focusTitle = false }: { focusTitle?: boolean }) {
  const keyId = useId();
  const capId = useId();
  const localHint = useId();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [sent, setSent] = useState<AiSentLog['rows'] | null>(null);
  const [permissions, setPermissions] = useState<AiPermissions['rows'] | null>(null);
  const [key, setKey] = useState('');
  const [changingKey, setChangingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<AiConnection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cap, setCap] = useState('');
  const [capProblem, setCapProblem] = useState(false);
  const [capSaved, setCapSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextStatus, log, allowed] = await Promise.all([
        window.retenia['ai.status']({}),
        window.retenia['ai.sentLog']({}),
        window.retenia['ai.permissions']({}),
      ]);
      setStatus(nextStatus);
      setSent(log.rows);
      setPermissions(allowed.rows);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Lo que llega de la IA cambia el gasto del mes y «Qué se envió».
    const stop = window.reteniaAvisos?.alRecibir((event) => {
      if (event.type === 'ai.result') {
        void load();
      }
    });
    return () => stop?.();
  }, [load]);

  useEffect(() => {
    if (status) {
      setCap((current) => (current === '' ? capText(status.capCents) : current));
    }
  }, [status]);

  const change = async (run: () => Promise<AiStatus>) => {
    setFailed(false);
    try {
      setStatus(await run());
    } catch {
      setFailed(true);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setConnection(null);
    try {
      const pasted = key.trim();
      const result = await window.retenia['ai.testConnection'](
        pasted === '' ? {} : { key: pasted },
      );
      setConnection(result);
      setStatus(result.status);
      if (result.result === 'ok') {
        // La clave ya está guardada: no queda en la pantalla.
        setKey('');
        setChangingKey(false);
      }
    } catch {
      setConnection(null);
      setFailed(true);
    } finally {
      setTesting(false);
    }
  };

  const saveCap = async () => {
    setCapSaved(false);
    const cents = centsFrom(cap);
    setCapProblem(cents === null);
    if (cents === null) {
      return;
    }
    await change(() => window.retenia['ai.setCap']({ capCents: cents }));
    setCap(capText(cents));
    setCapSaved(true);
  };

  const askingKey = status !== null && (!status.keySaved || changingKey);

  // Los permisos guardados: «Siempre» por un lado y «No» por otro. Borrar cualquiera de los dos hace
  // que la pregunta vuelva la próxima vez.
  const allowed = (permissions ?? []).filter((row) => row.scope === 'always');
  const refused = (permissions ?? []).filter((row) => row.scope === 'never');
  const forget = (materialId: string) =>
    void window.retenia['ai.revokePermission']({ materialId }).then(
      (next) => setPermissions(next.rows),
      () => setFailed(true),
    );
  return (
    <ScreenFrame level={3} title={texts.ai.title} focusTitle={focusTitle}>
      <p className={content.help}>{texts.ai.intro}</p>
      {failed ? <BannerEstado tone="attention">{texts.ai.failedSettings}</BannerEstado> : null}

      <div className={content.section}>
        <h4>{texts.ai.keyTitle}</h4>
        {status?.keySaved && !changingKey ? <p>{texts.ai.keySaved}</p> : null}
        {status !== null && !status.keySaved ? (
          <p className={content.help}>{texts.ai.noKey}</p>
        ) : null}
        {askingKey ? (
          <div className={form.field}>
            <label htmlFor={keyId}>{texts.ai.keyLabel}</label>
            <input
              id={keyId}
              type="password"
              value={key}
              placeholder={texts.ai.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setKey(event.target.value)}
            />
          </div>
        ) : null}
        <div className={content.actions}>
          <Boton
            busy={testing}
            disabled={testing || (askingKey && key.trim() === '')}
            onClick={() => void testConnection()}
          >
            {testing ? texts.ai.testing : texts.ai.testConnection}
          </Boton>
          {status?.keySaved && !changingKey ? (
            <>
              <Boton onClick={() => setChangingKey(true)}>{texts.ai.changeKey}</Boton>
              <Boton onClick={() => setDeleting(true)}>{texts.ai.deleteKey}</Boton>
            </>
          ) : null}
        </div>
        {connection ? (
          <BannerEstado tone={connection.result === 'ok' ? 'info' : 'attention'}>
            {texts.ai.connection[connection.result]}
          </BannerEstado>
        ) : null}
        {connection?.retiresOn ? (
          <p className={content.help}>
            {texts.ai.retiresOn(formatShortDate(connection.retiresOn))}
          </p>
        ) : null}
      </div>

      <div className={content.section}>
        <h4>{texts.ai.capTitle}</h4>
        {status ? <p>{texts.ai.counter(status.spentMicros, status.capCents)}</p> : null}
        {status?.capState === 'warning' ? (
          <BannerEstado tone="attention">{texts.ai.warning(status.percentUsed)}</BannerEstado>
        ) : null}
        {status?.capState === 'reached' ? (
          <BannerEstado tone="attention">{texts.ai.capReached}</BannerEstado>
        ) : null}
        <div className={form.field}>
          <label htmlFor={capId}>{texts.ai.capLabel}</label>
          <input
            id={capId}
            inputMode="decimal"
            value={cap}
            aria-invalid={capProblem}
            onChange={(event) => {
              setCap(event.target.value);
              setCapSaved(false);
            }}
          />
          {capProblem ? <p className={form.fieldNotice}>{texts.ai.capInvalid}</p> : null}
        </div>
        <div className={content.actions}>
          <Boton onClick={() => void saveCap()}>{texts.ai.capSave}</Boton>
        </div>
        {capSaved ? <p className={content.help}>{texts.ai.capSaved}</p> : null}
      </div>

      <div className={content.section}>
        <label className={content.checkbox}>
          <input
            type="checkbox"
            checked={status?.localOnly ?? false}
            disabled={status === null}
            aria-describedby={localHint}
            onChange={(event) => {
              const on = event.target.checked;
              void change(() => window.retenia['ai.setLocalOnly']({ on }));
            }}
          />
          {texts.ai.localOnly}
        </label>
        <p id={localHint} className={content.help}>
          {texts.ai.localOnlyHint}
        </p>
      </div>

      <div className={content.section}>
        <h4>{texts.ai.functionsTitle}</h4>
        <ItemList label={texts.ai.functionsTitle}>
          {(status?.functions ?? []).map((item) => {
            const name = texts.ai.purposes[item.id];
            const suspended = item.state === 'suspended';
            return (
              <ListItem
                key={item.id}
                text={texts.ai.functionRow(name, texts.ai.functionStates[item.state])}
                actions={
                  <Boton
                    onClick={() =>
                      void change(() =>
                        window.retenia['ai.setFunctionState']({
                          functionId: item.id,
                          suspended: !suspended,
                        }),
                      )
                    }
                  >
                    {suspended ? texts.ai.enable : texts.ai.suspend}
                  </Boton>
                }
              />
            );
          })}
        </ItemList>
      </div>

      <div className={content.section}>
        <h4>{texts.ai.sentTitle}</h4>
        {sent !== null && sent.length === 0 ? (
          <p className={content.help}>{texts.ai.sentEmpty}</p>
        ) : (
          <ItemList label={texts.ai.sentTitle}>
            {(sent ?? []).map((row) => (
              <ListItem
                key={row.id}
                text={texts.ai.sentRow(
                  formatShortDate(row.day),
                  texts.ai.purposes[row.purpose],
                  row.fragmentCount,
                  row.materialTitle,
                  row.costMicros,
                  row.status === 'ok' ? null : texts.ai.sentStatus[row.status],
                )}
              />
            ))}
          </ItemList>
        )}
      </div>

      <div className={content.section}>
        <h4>{texts.ai.permissionsTitle}</h4>
        {permissions !== null && allowed.length === 0 ? (
          <p className={content.help}>{texts.ai.permissionsEmpty}</p>
        ) : (
          <ItemList label={texts.ai.permissionsTitle}>
            {allowed.map((row) => (
              <ListItem
                key={row.materialId}
                text={row.title}
                actions={
                  <Boton onClick={() => forget(row.materialId)}>{texts.ai.revokePermission}</Boton>
                }
              />
            ))}
          </ItemList>
        )}
        {refused.length > 0 ? (
          <>
            <h4>{texts.ai.refusedTitle}</h4>
            <ItemList label={texts.ai.refusedTitle}>
              {refused.map((row) => (
                <ListItem
                  key={row.materialId}
                  text={row.title}
                  actions={
                    <Boton onClick={() => forget(row.materialId)}>{texts.ai.askAgain}</Boton>
                  }
                />
              ))}
            </ItemList>
          </>
        ) : null}
      </div>

      {deleting ? (
        <Dialog title={texts.ai.deleteKey} onClose={() => setDeleting(false)}>
          <p>{texts.ai.deleteKeyQuestion}</p>
          <div className={content.actions}>
            <Boton
              variant="primary"
              onClick={() => {
                setDeleting(false);
                setConnection(null);
                void change(() => window.retenia['ai.deleteKey']({}));
              }}
            >
              {texts.ai.deleteKeyConfirm}
            </Boton>
            <Boton onClick={() => setDeleting(false)}>{texts.ai.cancel}</Boton>
          </div>
        </Dialog>
      ) : null}
    </ScreenFrame>
  );
}
