import { useCallback, useRef, useState } from 'react';
import type { ActivityItem } from '../../preload/contract/activity';
import { texts } from '../../preload/contract/texts';
import { Toast } from '../ui/Frame';

// El cartel de lo que pasó con un botón «Deshacer» (Apuntes y Bandeja). Un cartel por vez: el que
// llega reemplaza al anterior. Cada cambio que se puede deshacer queda en «Actividad reciente»;
// el cartel guarda cuál es el que acaba de hacer y «Deshacer» lo deshace por ahí.

interface Notice {
  text: string;
  operationId: string | null;
}

export function useUndoNotice(afterUndo: () => Promise<void>) {
  const [notice, setNotice] = useState<Notice | null>(null);
  // Cada cartel nuevo invalida a los que todavía estaban esperando su operación.
  const latest = useRef(0);
  const undoing = useRef(false);

  const clear = useCallback(() => {
    latest.current += 1;
    setNotice(null);
  }, []);

  // Dice qué pasó. Con `kind`, el cambio recién hecho de ese tipo es el más nuevo de la lista de
  // actividad que se puede deshacer.
  const say = useCallback(async (text: string, kind?: ActivityItem['kind']) => {
    latest.current += 1;
    const mine = latest.current;
    let operationId: string | null = null;
    if (kind !== undefined) {
      try {
        const { items } = await window.retenia['activity.recent']({});
        operationId =
          items.find((item) => item.kind === kind && item.undoneKind === null && item.canUndo)
            ?.id ?? null;
      } catch {
        operationId = null;
      }
    }
    if (latest.current === mine) {
      setNotice({ text, operationId });
    }
  }, []);

  async function undo() {
    const operationId = notice?.operationId;
    if (!operationId || undoing.current) {
      return;
    }
    undoing.current = true;
    latest.current += 1;
    const mine = latest.current;
    let text: string;
    try {
      const { undone } = await window.retenia['activity.undo']({ operationId });
      text = undone ? texts.notes.toast.undone : texts.notes.toast.notUndone;
    } catch {
      text = texts.notes.actionFailed;
    }
    try {
      await afterUndo();
    } finally {
      undoing.current = false;
    }
    if (latest.current === mine) {
      setNotice({ text, operationId: null });
    }
  }

  return { notice, say, clear, undo };
}

export function NoticeToast({
  notice,
  onUndo,
}: {
  notice: Notice | null;
  onUndo: () => Promise<void>;
}) {
  return (
    <Toast
      action={
        notice?.operationId
          ? { text: texts.notes.toast.undo, onClick: () => void onUndo() }
          : undefined
      }
    >
      {notice?.text}
    </Toast>
  );
}
