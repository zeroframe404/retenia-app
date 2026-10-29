import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../../preload/contract/activity';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

type Kind = ActivityItem['kind'];
type Thing = 'note' | 'topic' | 'subject' | 'inbox';
type Verb = keyof typeof texts.activity.did;
type CardVerb = 'create' | 'edit' | 'remove' | 'restore';

// Eliminar para siempre lo que sigue en la papelera: no se puede deshacer ni tiene cosa que nombrar.
type PurgeKind = 'card.purge' | 'topic.purge' | 'note.purge' | 'inbox.purge';

const PURGED: Record<PurgeKind, string> = {
  'card.purge': texts.activity.purged,
  'topic.purge': texts.activity.purgedOther.topic,
  'note.purge': texts.activity.purgedOther.note,
  'inbox.purge': texts.activity.purgedOther.inbox,
};

// Qué cambio es cada tipo: sobre qué cosa y con qué verbo. Un tipo nuevo del contrato sin su
// renglón acá no compila.
type Change = { thing: 'card'; verb: CardVerb } | { thing: Thing; verb: Verb };

const CHANGES: Record<Exclude<Kind, PurgeKind>, Change> = {
  'card.create': { thing: 'card', verb: 'create' },
  'card.edit': { thing: 'card', verb: 'edit' },
  'card.delete': { thing: 'card', verb: 'remove' },
  'card.restore': { thing: 'card', verb: 'restore' },
  'subject.activate': { thing: 'subject', verb: 'activate' },
  'topic.create': { thing: 'topic', verb: 'create' },
  'topic.rename': { thing: 'topic', verb: 'rename' },
  'topic.archive': { thing: 'topic', verb: 'archive' },
  'topic.unarchive': { thing: 'topic', verb: 'unarchive' },
  'topic.delete': { thing: 'topic', verb: 'remove' },
  'topic.restore': { thing: 'topic', verb: 'restore' },
  'note.create': { thing: 'note', verb: 'create' },
  'note.move': { thing: 'note', verb: 'move' },
  'note.archive': { thing: 'note', verb: 'archive' },
  'note.unarchive': { thing: 'note', verb: 'unarchive' },
  'note.delete': { thing: 'note', verb: 'remove' },
  'note.restore': { thing: 'note', verb: 'restore' },
  'inbox.delete': { thing: 'inbox', verb: 'remove' },
  'inbox.restore': { thing: 'inbox', verb: 'restore' },
};

const CARD_DID: Record<CardVerb, (card: string) => string> = {
  create: texts.activity.created,
  edit: texts.activity.edited,
  remove: texts.activity.removed,
  restore: texts.activity.restored,
};

const CARD_UNDID: Record<CardVerb, (card: string) => string> = {
  create: texts.activity.undidCreate,
  edit: texts.activity.undidEdit,
  remove: texts.activity.undidRemove,
  restore: texts.activity.undidRestore,
};

function isPurge(kind: Kind): kind is PurgeKind {
  return Object.hasOwn(PURGED, kind);
}

function sentence(change: Change, label: string | null, undid: boolean): string {
  if (change.thing === 'card') {
    const card = texts.activity.cardName(label);
    return (undid ? CARD_UNDID : CARD_DID)[change.verb](card);
  }
  const name = texts.activity.things[change.thing](label);
  return `${(undid ? texts.activity.undid : texts.activity.did)[change.verb]} ${name}`;
}

// Lo que dice un renglón: qué cambio fue y sobre qué cosa (una tarjeta, una nota, un tema, una
// materia o algo de la Bandeja). Si deshizo otro cambio, dice cuál.
function describe(item: ActivityItem): string {
  if (isPurge(item.kind)) {
    return PURGED[item.kind];
  }
  if (item.undoneKind !== null) {
    if (isPurge(item.undoneKind)) {
      return PURGED[item.undoneKind];
    }
    return sentence(CHANGES[item.undoneKind], item.label, true);
  }
  return sentence(CHANGES[item.kind], item.label, false);
}

// «Actividad reciente»: tus últimos cambios, el más nuevo arriba, con «Deshacer» en los que
// todavía se pueden deshacer. Deshacer agrega un cambio; nunca borra uno.
export function ActivityScreen({
  onBackToCards,
  onChanged,
}: {
  onBackToCards?: () => void;
  // Deshacer puede cambiar lo que muestra el resto de la ventana (la materia activa, la Bandeja).
  onChanged?: () => void;
} = {}) {
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
      onChanged?.();
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
