import { useCallback, useEffect, useRef, useState } from 'react';
import type { Backup, DataDifference } from '../../preload/contract/backups';
import { formatShortDate, formatSize, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

// Lo que dice una diferencia de «Verificar datos», sin términos técnicos.
function describe(difference: DataDifference): string {
  const question = difference.question ?? '';
  switch (difference.kind) {
    case 'due':
      return texts.data.differenceDue(
        question,
        difference.storedDay === null ? '' : formatShortDate(difference.storedDay),
        difference.expectedDay === null ? '' : formatShortDate(difference.expectedDay),
      );
    case 'memory':
      return texts.data.differenceMemory(question);
    case 'missing':
      return texts.data.differenceMissing(question);
    case 'extra':
      return texts.data.differenceExtra;
  }
}

// Ajustes › «Datos y copias»: «Verificar datos» (recalcula todo desde el historial y lo compara
// con lo guardado), «Reparar desde el historial», «Hacer copia ahora», la lista de copias con
// «Restaurar» y «Abrir carpeta de copias». Un pedido por vez.
export function DataSection() {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [differences, setDifferences] = useState<DataDifference[] | null>(null);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const load = useCallback(async () => {
    try {
      setBackups((await window.retenia['backups.list']({})).backups);
    } catch {
      setNotice(texts.data.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const verify = (channel: 'backups.verifyData' | 'backups.repairData') =>
    run(async () => {
      setVerifyFailed(false);
      try {
        setDifferences((await window.retenia[channel]({})).differences);
      } catch {
        setDifferences(null);
        setVerifyFailed(true);
      }
    });

  const makeCopy = () =>
    run(async () => {
      setNotice(texts.data.working);
      try {
        setBackups((await window.retenia['backups.createNow']({})).backups);
        setNotice(texts.data.copyMade);
      } catch {
        setNotice(texts.data.copyFailed);
      }
    });

  const restore = (backupId: string) =>
    run(async () => {
      setNotice(texts.data.working);
      try {
        const { restoredFrom, backups: listed } = await window.retenia['backups.restore']({
          backupId,
        });
        setBackups(listed);
        setDifferences(null);
        setNotice(texts.data.restored(formatShortDate(restoredFrom.day), restoredFrom.time));
      } catch {
        setNotice(texts.data.restoreFailed);
        await load();
      }
    });

  const openFolder = async () => {
    try {
      await window.retenia['backups.openFolder']({});
    } catch {
      setNotice(texts.data.openFailed);
    }
  };

  const verdict = verifyFailed
    ? { tone: 'attention' as const, text: texts.data.verifyFailed }
    : differences !== null && differences.length === 0
      ? { tone: 'success' as const, text: texts.data.allGood }
      : differences !== null
        ? { tone: 'info' as const, text: texts.data.differencesFound(differences.length) }
        : null;

  return (
    <ScreenFrame level={3} title={texts.data.title}>
      <div className={styles.actions}>
        <Boton disabled={busy} onClick={() => void verify('backups.verifyData')}>
          {texts.data.verify}
        </Boton>
      </div>
      <Toast tone={verdict?.tone}>{verdict?.text}</Toast>
      {differences !== null && differences.length > 0 ? (
        <>
          <ItemList label={texts.data.differencesLabel}>
            {differences.map((difference) => (
              <ListItem
                key={`${difference.cardId}-${difference.kind}`}
                text={describe(difference)}
              />
            ))}
          </ItemList>
          <div className={styles.actions}>
            <Boton disabled={busy} onClick={() => void verify('backups.repairData')}>
              {texts.data.repair}
            </Boton>
          </div>
        </>
      ) : null}

      <div className={styles.section}>
        <h4>{texts.data.copiesTitle}</h4>
        <div className={styles.actions}>
          <Boton variant="primary" disabled={busy} onClick={() => void makeCopy()}>
            {texts.data.makeCopy}
          </Boton>
          <Boton onClick={() => void openFolder()}>{texts.data.openFolder}</Boton>
        </div>
        <Toast>{notice}</Toast>
        {backups !== null && backups.length === 0 ? (
          <ViewState kind="empty" phrase={texts.data.noCopies} />
        ) : null}
        {backups !== null && backups.length > 0 ? (
          <ItemList label={texts.data.copiesLabel}>
            {backups.map((backup, index) =>
              backup.readable ? (
                <ListItem
                  key={backup.id}
                  text={texts.data.copyRow(
                    formatShortDate(backup.day),
                    backup.time,
                    texts.data.kinds[backup.kind],
                    formatSize(backup.sizeBytes),
                  )}
                  actions={
                    <>
                      <span className={styles.verified}>{texts.data.verified}</span>
                      <Boton disabled={busy} onClick={() => void restore(backup.id)}>
                        {texts.data.restore}
                      </Boton>
                    </>
                  }
                />
              ) : (
                <ListItem
                  // biome-ignore lint/suspicious/noArrayIndexKey: una copia ilegible no tiene identificador.
                  key={`ilegible-${index}`}
                  text={texts.data.unreadableCopy(formatSize(backup.sizeBytes))}
                />
              ),
            )}
          </ItemList>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
