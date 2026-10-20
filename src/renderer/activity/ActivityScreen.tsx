import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../../preload/contract/activity';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

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
export function ActivityScreen({ onBackToCards }: { onBackToCards?: () => void } = {}) {
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
    <ScreenFrame level={3} title={texts.activity.title}>
      <Toast>{notice}</Toast>
      {loadFailed ? (
        <ViewState
          kind="error"
          phrase={texts.activity.loadFailed}
          action={{ text: texts.cards.retry, onClick: () => void load() }}
        />
      ) : null}
      {items !== null && items.length === 0 ? (
        <ViewState
          kind="empty"
          phrase={texts.activity.empty}
          action={
            onBackToCards ? { text: texts.cards.backToCards, onClick: onBackToCards } : undefined
          }
        />
      ) : null}
      {items !== null && items.length > 0 ? (
        <ItemList label={texts.activity.listLabel}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              text={texts.activity.row(`${formatShortDate(item.day)} ${item.time}`, describe(item))}
              actions={
                item.canUndo ? (
                  <Boton disabled={busy} onClick={() => void undo(item)}>
                    {texts.activity.undo}
                  </Boton>
                ) : undefined
              }
            />
          ))}
        </ItemList>
      ) : null}
    </ScreenFrame>
  );
}
