import { useState } from 'react';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './NoteEditor.module.css';

export interface CardNotice {
  cardId: string;
  question: string;
}

// Lo que pregunta el guardado de una nota sobre las tarjetas de sus renglones:
// - un renglón que era tarjeta con historial ya no lo es (CA-052): una pregunta por tarjeta, con
//   «Conservar la tarjeta» (la tarjeta queda en Tarjetas, sin nota) y «Eliminar la tarjeta» (va a la
//   Papelera con su historial). Esc o cerrar es conservar: nada se pierde sin que lo pidas.
// - una tarjeta con historial cambió de texto (CA-054): «¿Cambió lo que hay que recordar?», que
//   no frena la escritura: aviso al costado hasta que respondas.
export function CardNotices({
  lost,
  edited,
  onKeep,
  onRemove,
  onMeaning,
}: {
  lost: readonly CardNotice[];
  edited: readonly CardNotice[];
  onKeep: (notice: CardNotice) => void;
  onRemove: (notice: CardNotice) => Promise<boolean>;
  onMeaning: (notice: CardNotice, changed: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const first = lost[0];

  async function guarded(task: () => Promise<boolean>) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {edited.map((notice) => (
        <BannerEstado
          key={notice.cardId}
          tone="info"
          action={
            <>
              <Boton disabled={busy} onClick={() => void guarded(() => onMeaning(notice, false))}>
                {texts.cards.meaningNo}
              </Boton>
              <Boton disabled={busy} onClick={() => void guarded(() => onMeaning(notice, true))}>
                {texts.cards.meaningYes}
              </Boton>
            </>
          }
        >
          {`${texts.cards.meaningInNote(notice.question)} ${texts.cards.meaningTitle}`}
        </BannerEstado>
      ))}
      {first ? (
        <Dialog title={texts.cards.lostTitle} onClose={() => onKeep(first)}>
          <p>{texts.cards.lostCard(first.question)}</p>
          <div className={styles.noticeActions}>
            <Boton variant="primary" onClick={() => onKeep(first)}>
              {texts.cards.lostKeep}
            </Boton>
            <Boton disabled={busy} onClick={() => void guarded(() => onRemove(first))}>
              {texts.cards.lostRemove}
            </Boton>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
