import { useCallback, useEffect, useRef, useState } from 'react';
import { formatShortDate, texts } from '../../preload/contract/texts';
import type { TrashItem, TrashOrganizationItem } from '../../preload/contract/trash';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import { ItemList, ListItem, ScreenFrame, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

// Una cosa de la papelera, sea tarjeta, nota, tema o elemento de la Bandeja. `kind` es nulo en las
// tarjetas (la pantalla nació con ellas y no las rotula).
interface Row {
  id: string;
  name: string;
  kind: string | null;
  deletedDay: string;
  expiresDay: string;
}

function cardRow(item: TrashItem): Row {
  return {
    id: item.id,
    name: item.question,
    kind: null,
    deletedDay: item.deletedDay,
    expiresDay: item.expiresDay,
  };
}

function organizationRow(item: TrashOrganizationItem): Row {
  return {
    id: item.id,
    name: item.name === '' ? texts.trash.untitled : item.name,
    kind: texts.trash.kinds[item.kind],
    deletedDay: item.deletedDay,
    expiresDay: item.expiresDay,
  };
}

// «Papelera»: lo eliminado espera 30 días. «Restaurar» lo devuelve con su historial; «Vaciar
// papelera» pide confirmación y lo elimina para siempre (el historial de repasos queda). Junta las
// tarjetas con las notas, los temas y lo de la Bandeja, lo más nuevo primero.
export function TrashScreen({
  onBackToCards,
  onChanged,
}: {
  onBackToCards?: () => void;
  // Restaurar o vaciar puede cambiar lo que muestra el resto de la ventana (la Bandeja).
  onChanged?: () => void;
} = {}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [cards, organization] = await Promise.all([
        window.retenia['trash.list']({}),
        window.retenia['trash.listOrganization']({}),
      ]);
      const merged = [...cards.items.map(cardRow), ...organization.items.map(organizationRow)];
      // Lo más nuevo primero; a igual día, el orden en que llegaron (las tarjetas antes).
      merged.sort((a, b) => b.deletedDay.localeCompare(a.deletedDay));
      setRows(merged);
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
      onChanged?.();
    }
  }

  const restore = (row: Row) =>
    act(async () => {
      const { restored } = await window.retenia['trash.restore']({ entryId: row.id });
      if (!restored) {
        return texts.trash.notRestored;
      }
      return row.kind === null ? texts.trash.restored : texts.trash.otherRestored;
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
        rows !== null && rows.length > 0 && !confirming ? (
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
      {rows !== null && rows.length === 0 && !loadFailed ? (
        <ViewState
          kind="empty"
          phrase={texts.trash.empty}
          action={
            onBackToCards ? { text: texts.cards.backToCards, onClick: onBackToCards } : undefined
          }
        />
      ) : null}
      {rows !== null && rows.length > 0 && !loadFailed ? (
        <ItemList label={texts.trash.listLabel}>
          {rows.map((row) => (
            <ListItem
              key={row.id}
              title={row.name}
              text={row.kind ?? undefined}
              detail={texts.trash.expires(formatShortDate(row.expiresDay))}
              actions={
                <Boton disabled={busy} onClick={() => void restore(row)}>
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
