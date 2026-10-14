import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../../preload/contract/activity';
import { formatShortDate, texts } from '../../preload/contract/texts';
import styles from '../ui.module.css';

// Lo que dice un renglón: qué cambio fue y sobre qué tarjeta.
function describe(item: ActivityItem): string {
  const card = texts.activity.cardName(item.label);
  switch (item.undoneKind) {
    case 'card.create':
      return texts.activity.undidCreate(card);
    case 'card.edit':
      return texts.activity.undidEdit(card);
    case 'card.delete':
      return texts.activity.undidRemove(card);
    case 'card.restore':
      return texts.activity.undidRestore(card);
    default:
      break;
  }
  switch (item.kind) {
    case 'card.create':
      return texts.activity.created(card);
    case 'card.edit':
      return texts.activity.edited(card);
    case 'card.delete':
      return texts.activity.removed(card);
    case 'card.restore':
      return texts.activity.restored(card);
    case 'card.purge':
      return texts.activity.purged;
  }
}

// «Actividad reciente»: tus últimos cambios, el más nuevo arriba, con «Deshacer» en los que
// todavía se pueden deshacer. Deshacer agrega un cambio; nunca borra uno.
export function ActivityScreen() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setItems((await window.retenia['activity.recent']({})).items);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function undo(item: ActivityItem) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setNotice('');
    try {
      const { undone } = await window.retenia['activity.undo']({ operationId: item.id });
      setNotice(undone ? texts.activity.undone : texts.activity.notUndone);
    } catch {
      setNotice(texts.activity.failed);
    } finally {
      working.current = false;
      setBusy(false);
      await load();
    }
  }

  return (
    <section className={styles.screen} aria-labelledby="titulo-actividad">
      <div className={styles.header}>
        <h2 id="titulo-actividad">{texts.activity.title}</h2>
      </div>
      <div role="status" className={styles.notice}>
        {notice}
      </div>
      {loadFailed ? <p className={styles.loadFailed}>{texts.activity.loadFailed}</p> : null}
      {items !== null && items.length === 0 ? (
        <p className={styles.empty}>{texts.activity.empty}</p>
      ) : null}
      {items !== null && items.length > 0 ? (
        <ul className={styles.list} aria-label={texts.activity.listLabel}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <p className={styles.itemText}>
                {texts.activity.row(`${formatShortDate(item.day)} ${item.time}`, describe(item))}
              </p>
              {item.canUndo ? (
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => void undo(item)}
                  >
                    {texts.activity.undo}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
