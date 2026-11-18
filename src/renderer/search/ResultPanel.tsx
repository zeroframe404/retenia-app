import { useEffect, useState } from 'react';
import type { CardDetail } from '../../preload/contract/cards';
import type { Note, NoteSummary } from '../../preload/contract/notes';
import type { SearchHit } from '../../preload/contract/search';
import { texts } from '../../preload/contract/texts';
import { CardFace } from '../cards/CardFace';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import styles from './Search.module.css';

type Content =
  | { kind: 'note'; note: Note; focusId: string | null }
  | { kind: 'card'; card: CardDetail }
  | { kind: 'topic'; notes: NoteSummary[] }
  | { kind: 'doubt' };

type State = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; content: Content };

const INDENT = 20;

// Lo que se pide para mostrar un resultado.
async function load(hit: SearchHit): Promise<Content> {
  if (hit.kind === 'note' || hit.kind === 'block') {
    const noteId = hit.kind === 'note' ? hit.entityId : (hit.parentId ?? '');
    const note = await window.retenia['notes.get']({ noteId });
    return { kind: 'note', note, focusId: hit.kind === 'block' ? hit.entityId : null };
  }
  if (hit.kind === 'card') {
    return { kind: 'card', card: await window.retenia['cards.get']({ cardId: hit.entityId }) };
  }
  if (hit.kind === 'topic' && hit.subjectId !== null) {
    const { notes } = await window.retenia['notes.list']({ subjectId: hit.subjectId });
    return {
      kind: 'topic',
      notes: notes.filter((note) => note.topicId === hit.entityId && !note.archived),
    };
  }
  return { kind: 'doubt' };
}

// Durante una sesión, un resultado del buscador se abre acá, en un panel a la derecha: la sesión
// sigue detrás con su tarjeta y su borrador, y al cerrar el panel el foco vuelve al campo de
// respuesta. Es para consultar: no se edita nada.
export function ResultPanel({ hit, onClose }: { hit: SearchHit; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    load(hit).then(
      (content) => {
        if (alive) {
          setState({ status: 'ready', content });
        }
      },
      () => {
        if (alive) {
          setState({ status: 'failed' });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [hit]);

  const title = hit.title.map((segment) => segment.text).join('') || texts.search.untitled;
  return (
    <Dialog title={title} placement="side" onClose={onClose}>
      {state.status === 'loading' ? (
        <ViewState kind="loading" phrase={texts.search.panel.loading} />
      ) : null}
      {state.status === 'failed' ? (
        <BannerEstado tone="attention">{texts.search.panel.loadFailed}</BannerEstado>
      ) : null}
      {state.status === 'ready' ? <Body content={state.content} hit={hit} /> : null}
    </Dialog>
  );
}

function Body({ content, hit }: { content: Content; hit: SearchHit }) {
  if (content.kind === 'note') {
    const depth = new Map<string, number>();
    return (
      <div className={styles.body}>
        {content.note.blocks.map((block) => {
          const level = block.parentId === null ? 0 : (depth.get(block.parentId) ?? 0) + 1;
          depth.set(block.id, level);
          return (
            <div
              key={block.id}
              className={styles.row}
              data-focus={block.id === content.focusId}
              style={{ marginLeft: level * INDENT }}
            >
              <CardFace content={block.content} />
            </div>
          );
        })}
      </div>
    );
  }
  if (content.kind === 'card') {
    return (
      <div className={styles.body}>
        <p className={styles.label}>{texts.search.panel.question}</p>
        <CardFace content={content.card.questionContent} />
        <p className={styles.label}>{texts.search.panel.answer}</p>
        <CardFace content={content.card.answerContent} />
      </div>
    );
  }
  if (content.kind === 'topic') {
    return content.notes.length === 0 ? (
      <p className={styles.text}>{texts.search.panel.noNotes}</p>
    ) : (
      <div className={styles.body}>
        <p className={styles.label}>{texts.search.panel.topicNotes}</p>
        {content.notes.map((note) => (
          <p key={note.id} className={styles.text}>
            {note.title === '' ? texts.search.untitled : note.title}
          </p>
        ))}
      </div>
    );
  }
  return <p className={styles.text}>{hit.title.map((segment) => segment.text).join('')}</p>;
}
