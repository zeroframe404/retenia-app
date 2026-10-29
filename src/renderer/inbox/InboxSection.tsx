import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxItem, Topic } from '../../preload/contract/organization';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { TopicPicker } from '../notes/TopicPicker';
import { NoticeToast, useUndoNotice } from '../notes/undoNotice';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

// Apuntes › «Bandeja»: lo anotado al vuelo, el más nuevo primero. «Mover a…» lo convierte en una
// nota del tema elegido (CA-047) y «Eliminar» lo manda a la Papelera.
export function InboxSection({
  subjectId,
  count: outsideCount,
  onCount,
}: {
  subjectId: string;
  // Cuántos elementos hay según el resto de la ventana: si cambia sin que esta lista haya hecho
  // nada (se anotó algo al vuelo con Ctrl+Mayús+N mientras se la mira), se pide de nuevo.
  count: number;
  // Cuántos elementos hay: el riel y la pestaña lo muestran.
  onCount: (count: number) => void;
}) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [moving, setMoving] = useState<{ item: InboxItem; topics: Topic[] } | null>(null);
  const working = useRef(false);

  const load = useCallback(async () => {
    try {
      const { items: fresh, count } = await window.retenia['inbox.list']({});
      setItems(fresh);
      setLoadFailed(false);
      onCount(count);
    } catch {
      setLoadFailed(true);
    }
  }, [onCount]);

  const { notice, say, clear, undo } = useUndoNotice(load);

  // biome-ignore lint/correctness/useExhaustiveDependencies: la lista se pide de nuevo cuando cambia el contador de afuera.
  useEffect(() => {
    void load();
  }, [load, outsideCount]);

  // Un pedido por vez: un doble toque no mueve ni elimina dos veces.
  async function act(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    clear();
    try {
      await task();
    } catch {
      await say(texts.notes.actionFailed);
    } finally {
      working.current = false;
    }
  }

  const askTopics = (item: InboxItem) =>
    act(async () => {
      const { topics } = await window.retenia['topics.list']({ subjectId });
      setMoving({ item, topics: topics.filter((topic) => !topic.archived) });
    });

  const move = (topic: Topic, item: InboxItem) =>
    act(async () => {
      await window.retenia['inbox.move']({ itemId: item.id, topicId: topic.id });
      setMoving(null);
      await load();
      await say(texts.inbox.moved(topic.name));
    });

  const remove = (item: InboxItem) =>
    act(async () => {
      await window.retenia['inbox.delete']({ itemId: item.id });
      await load();
      await say(texts.inbox.removed, 'inbox.delete');
    });

  return (
    <ScreenFrame level={3} title={texts.inbox.title}>
      <NoticeToast notice={notice} onUndo={undo} />
      {loadFailed ? (
        <ViewState
          kind="error"
          phrase={texts.inbox.loadFailed}
          action={{ text: texts.notes.retry, onClick: () => void load() }}
        />
      ) : null}
      {items === null && !loadFailed ? (
        <ViewState kind="loading" phrase={texts.inbox.loading} />
      ) : null}
      {items !== null && items.length === 0 && !loadFailed ? (
        <ViewState kind="empty" phrase={texts.inbox.empty} />
      ) : null}
      {items !== null && items.length > 0 && !loadFailed ? (
        <ItemList label={texts.inbox.listLabel}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              text={item.text}
              detail={formatShortDate(item.day)}
              actions={
                <>
                  <Boton onClick={() => void askTopics(item)}>{texts.inbox.moveTo}</Boton>
                  <Boton onClick={() => void remove(item)}>{texts.inbox.remove}</Boton>
                </>
              }
            />
          ))}
        </ItemList>
      ) : null}
      {moving ? (
        <TopicPicker
          title={texts.inbox.moveTitle}
          topics={moving.topics}
          noTopicsText={texts.inbox.moveNoTopics}
          onPick={(topicId) => {
            const topic = moving.topics.find((candidate) => candidate.id === topicId);
            if (topic) {
              void move(topic, moving.item);
            }
          }}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </ScreenFrame>
  );
}
