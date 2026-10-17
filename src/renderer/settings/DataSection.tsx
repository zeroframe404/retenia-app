import { useCallback, useEffect, useRef, useState } from 'react';
import type { Backup, DataDifference } from '../../preload/contract/backups';
import { formatShortDate, formatSize, texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';

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

  return (
    <section className={styles.section} aria-labelledby="titulo-datos">
      <h3 id="titulo-datos">{texts.data.title}</h3>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => void verify('backups.verifyData')}
        >
          {texts.data.verify}
        </button>
      </div>
      <div role="status" className={styles.result}>
        {verifyFailed ? texts.data.verifyFailed : null}
        {differences !== null && differences.length === 0 ? texts.data.allGood : null}
        {differences !== null && differences.length > 0
          ? texts.data.differencesFound(differences.length)
          : null}
      </div>
      {differences !== null && differences.length > 0 ? (
        <>
          <ul className={styles.list} aria-label={texts.data.differencesLabel}>
            {differences.map((difference) => (
              <li key={`${difference.cardId}-${difference.kind}`} className={styles.item}>
                {describe(difference)}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => void verify('backups.repairData')}
            >
              {texts.data.repair}
            </button>
          </div>
        </>
      ) : null}

      <h4>{texts.data.copiesTitle}</h4>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={() => void makeCopy()}
        >
          {texts.data.makeCopy}
        </button>
        <button type="button" className={styles.secondary} onClick={() => void openFolder()}>
          {texts.data.openFolder}
        </button>
      </div>
      <div role="status" className={styles.notice}>
        {notice}
      </div>
      {backups !== null && backups.length === 0 ? (
        <p className={styles.empty}>{texts.data.noCopies}</p>
      ) : null}
      {backups !== null && backups.length > 0 ? (
        <ul className={styles.list} aria-label={texts.data.copiesLabel}>
          {backups.map((backup, index) =>
            backup.readable ? (
              <li key={backup.id} className={styles.item}>
                <span className={styles.copyText}>
                  {texts.data.copyRow(
                    formatShortDate(backup.day),
                    backup.time,
                    texts.data.kinds[backup.kind],
                    formatSize(backup.sizeBytes),
                  )}
                </span>
                <span className={styles.verified}>{texts.data.verified}</span>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void restore(backup.id)}
                >
                  {texts.data.restore}
                </button>
              </li>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: una copia ilegible no tiene identificador.
              <li key={`ilegible-${index}`} className={styles.item}>
                <span className={styles.copyText}>
                  {texts.data.unreadableCopy(formatSize(backup.sizeBytes))}
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}
