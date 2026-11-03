import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { z } from 'zod';
import {
  AUTOSAVE_MS,
  MAX_TITLE_LENGTH,
  type Note,
  type notesMentionsResponse,
} from '../../preload/contract/notes';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { IndicadorBorrador } from '../ui/Labels';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { Autosaver, type SaveStatus } from './editor/autosave';
import { docToBlocks } from './editor/convert';
import { RowsEditor } from './editor/RowsEditor';
import styles from './NoteEditor.module.css';

type Mentions = z.output<typeof notesMentionsResponse>['mentions'];

const DRAFT_STATE = { saving: 'saving', saved: 'saved' } as const;

// «Mencionada en»: los renglones de otras notas que enlazan a esta, cada uno con el nombre de su
// nota de origen. Un clic lleva a ese renglón. La lista se lee al abrir la sección y no se
// actualiza sola mientras escribís.
function MentionedIn({
  noteId,
  onOpenNote,
}: {
  noteId: string;
  onOpenNote: (noteId: string, blockId?: string) => void;
}) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'failed' } | { status: 'ready'; mentions: Mentions }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` solo sirve para volver a pedir
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    window.retenia['notes.mentions']({ noteId }).then(
      ({ mentions }) => {
        if (current) {
          setState({ status: 'ready', mentions });
        }
      },
      () => {
        if (current) {
          setState({ status: 'failed' });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [noteId, attempt]);

  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'failed') {
    return (
      <ViewState
        kind="error"
        phrase={texts.notes.editor.mentionsFailed}
        action={{ text: texts.notes.retry, onClick: () => setAttempt((count) => count + 1) }}
      />
    );
  }
  if (state.mentions.length === 0) {
    return <ViewState kind="empty" phrase={texts.notes.editor.noMentions} />;
  }
  return (
    <ItemList label={texts.notes.editor.mentionsLabel}>
      {state.mentions.map((mention) => {
        const name = mention.noteTitle === '' ? texts.notes.list.untitled : mention.noteTitle;
        return (
          <ListItem
            key={`${mention.noteId}:${mention.blockId}`}
            title={name}
            text={mention.excerpt}
            actions={
              <Boton
                variant="quiet"
                aria-label={texts.notes.editor.mentionOpen(name)}
                onClick={() => onOpenNote(mention.noteId, mention.blockId)}
              >
                {texts.notes.list.open}
              </Boton>
            }
          />
        );
      })}
    </ItemList>
  );
}

// La pantalla de una nota: su título, el editor por renglones y «Mencionada en». Lo que escribís se
// guarda solo a los dos segundos de dejar de escribir, y lo pendiente se guarda enseguida al volver,
// al dejar la pantalla y cuando la ventana se va a cerrar.
export function NoteEditor({
  note,
  focusBlockId = null,
  autoFocusTitle = false,
  onBack,
  onOpenNote,
  onSaved,
}: {
  note: Note;
  focusBlockId?: string | null;
  autoFocusTitle?: boolean;
  onBack: () => void;
  onOpenNote: (noteId: string, blockId?: string) => void;
  onSaved?: () => void;
}) {
  const titleId = useId();
  const titleField = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [imageFailed, setImageFailed] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);

  // Lo último que hay en pantalla, para guardarlo aunque el editor ya no esté.
  const titleNow = useRef(note.title);
  const docNow = useRef<ProseMirrorNode | null>(null);
  const latest = useRef({ noteId: note.id, onSaved });
  latest.current = { noteId: note.id, onSaved };

  const [autosaver] = useState(
    () =>
      new Autosaver({
        delay: AUTOSAVE_MS,
        save: async () => {
          const doc = docNow.current;
          if (doc === null) {
            return;
          }
          await window.retenia['notes.save']({
            noteId: latest.current.noteId,
            title: titleNow.current,
            blocks: docToBlocks(doc.toJSON()),
          });
        },
        onStatus: setStatus,
        onSaved: () => latest.current.onSaved?.(),
      }),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir la nota; para cambiar de nota la pantalla se vuelve a montar
  useEffect(() => {
    if (autoFocusTitle && focusBlockId === null) {
      titleField.current?.focus();
    }
  }, []);

  // Al dejar la pantalla se guarda lo pendiente, y si la ventana se va a cerrar, se espera.
  useEffect(() => {
    const unregister = window.reteniaCierre?.alCerrar(async () => {
      await autosaver.flush();
    });
    return () => {
      unregister?.();
      void autosaver.flush();
    };
  }, [autosaver]);

  const changeDoc = useCallback(
    (doc: ProseMirrorNode) => {
      docNow.current = doc;
      setImageFailed(false);
      autosaver.touch();
    },
    [autosaver],
  );

  async function goBack() {
    if (await autosaver.flush()) {
      onBack();
    }
  }

  const draft = status === 'saving' || status === 'saved' ? DRAFT_STATE[status] : null;

  return (
    <ScreenFrame
      level={3}
      title={title === '' ? texts.notes.list.untitled : title}
      actions={
        <Boton variant="primary" icon={ArrowLeft} onClick={goBack}>
          {texts.notes.editor.back}
        </Boton>
      }
    >
      <div className={styles.page}>
        <div className={styles.titleRow}>
          <label htmlFor={titleId} className="visually-hidden">
            {texts.notes.editor.titleLabel}
          </label>
          <input
            id={titleId}
            ref={titleField}
            type="text"
            className={styles.title}
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            placeholder={texts.notes.list.untitled}
            onChange={(event) => {
              setTitle(event.target.value);
              titleNow.current = event.target.value;
              autosaver.touch();
            }}
          />
          {draft === null ? null : <IndicadorBorrador state={draft} />}
        </div>
        {status === 'failed' ? (
          <BannerEstado tone="attention">{texts.notes.editor.saveFailed}</BannerEstado>
        ) : null}
        {imageFailed ? (
          <BannerEstado tone="attention">{texts.notes.editor.imageFailed}</BannerEstado>
        ) : null}
        <RowsEditor
          blocks={note.blocks}
          focusBlockId={focusBlockId}
          onReady={(doc) => {
            docNow.current = doc;
          }}
          onDocChange={changeDoc}
          onOpenNote={(noteId) => onOpenNote(noteId)}
          onImageError={() => setImageFailed(true)}
        />
        <div className={styles.mentions}>
          <Boton aria-expanded={mentionsOpen} onClick={() => setMentionsOpen((open) => !open)}>
            {texts.notes.editor.mentionedIn}
          </Boton>
          {mentionsOpen ? <MentionedIn noteId={note.id} onOpenNote={onOpenNote} /> : null}
        </div>
      </div>
    </ScreenFrame>
  );
}
