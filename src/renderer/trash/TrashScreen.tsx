import { useCallback, useEffect, useRef, useState } from 'react';
import { formatShortDate, texts } from '../../preload/contract/texts';
import type { TrashItem } from '../../preload/contract/trash';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

// «Papelera»: lo eliminado espera 30 días. «Restaurar» lo devuelve con su historial; «Vaciar
// papelera» pide confirmación y lo elimina para siempre (el historial de repasos queda).
export function TrashScreen({ onBackToCards }: { onBackToCards?: () => void } = {}) {
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
    <ScreenFrame
      level={3}
      title={texts.trash.title}
      actions={
        items !== null && items.length > 0 && !confirming ? (
          <Boton disabled={busy} onClick={() => setConfirming(true)}>
            {texts.trash.emptyTrash}
          </Boton>
        ) : null
      }
    >
      <Toast>{notice}</Toast>
      {confirming ? (
        <div className={styles.confirmation}>
          <p>{texts.trash.confirmEmpty}</p>
          <div className={styles.actions}>
            <Boton disabled={busy} onClick={() => void empty()}>
              {texts.trash.confirm}
            </Boton>
            <Boton onClick={() => setConfirming(false)}>{texts.trash.cancel}</Boton>
          </div>
        </div>
      ) : null}
      {loadFailed ? (
        <ViewState
          kind="error"
          phrase={texts.trash.loadFailed}
          action={{ text: texts.cards.retry, onClick: () => void load() }}
        />
      ) : null}
      {items !== null && items.length === 0 ? (
        <ViewState
          kind="empty"
          phrase={texts.trash.empty}
          action={
            onBackToCards ? { text: texts.cards.backToCards, onClick: onBackToCards } : undefined
          }
        />
      ) : null}
      {items !== null && items.length > 0 ? (
        <ItemList label={texts.trash.listLabel}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              title={item.question}
              detail={texts.trash.expires(formatShortDate(item.expiresDay))}
              actions={
                <Boton disabled={busy} onClick={() => void restore(item)}>
                  {texts.trash.restore}
                </Boton>
              }
            />
          ))}
        </ItemList>
      ) : null}
    </ScreenFrame>
  );
}
