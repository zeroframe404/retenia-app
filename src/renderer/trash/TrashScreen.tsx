import { useCallback, useEffect, useRef, useState } from 'react';
import { formatShortDate, texts } from '../../preload/contract/texts';
import type { TrashItem } from '../../preload/contract/trash';
import styles from '../ui.module.css';

// «Papelera»: lo eliminado espera 30 días. «Restaurar» lo devuelve con su historial; «Vaciar
// papelera» pide confirmación y lo elimina para siempre (el historial de repasos queda).
export function TrashScreen() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setItems((await window.retenia['trash.list']({})).items);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Un pedido por vez: un doble toque no restaura ni vacía dos veces.
  async function act(task: () => Promise<string>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setNotice('');
    try {
      setNotice(await task());
    } catch {
      setNotice(texts.trash.actionFailed);
    } finally {
      working.current = false;
      setBusy(false);
      setConfirming(false);
      await load();
    }
  }

  const restore = (item: TrashItem) =>
    act(async () => {
      const { restored } = await window.retenia['trash.restore']({ entryId: item.id });
      return restored ? texts.trash.restored : texts.trash.notRestored;
    });

  const empty = () =>
    act(async () => {
      await window.retenia['trash.empty']({});
      return texts.trash.emptied;
    });

  return (
    <section className={styles.screen} aria-labelledby="titulo-papelera">
      <div className={styles.header}>
        <h2 id="titulo-papelera">{texts.trash.title}</h2>
        {items !== null && items.length > 0 && !confirming ? (
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {texts.trash.emptyTrash}
          </button>
        ) : null}
      </div>
      <div role="status" className={styles.notice}>
        {notice}
      </div>
      {confirming ? (
        <div className={styles.confirm}>
          <p>{texts.trash.confirmEmpty}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => void empty()}
            >
              {texts.trash.confirm}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
              {texts.trash.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {loadFailed ? <p className={styles.loadFailed}>{texts.trash.loadFailed}</p> : null}
      {items !== null && items.length === 0 ? (
        <p className={styles.empty}>{texts.trash.empty}</p>
      ) : null}
      {items !== null && items.length > 0 ? (
        <ul className={styles.list} aria-label={texts.trash.listLabel}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemText}>
                <p className={styles.question}>{item.question}</p>
                <p className={styles.meta}>
                  {texts.trash.expires(formatShortDate(item.expiresDay))}
                </p>
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void restore(item)}
                >
                  {texts.trash.restore}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
