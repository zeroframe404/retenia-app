import { useCallback, useEffect, useRef, useState } from 'react';
import type { Note, NoteSummary } from '../../preload/contract/notes';
import type { Subject, Topic } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import { NoteEditor } from './NoteEditor';
import styles from './Notes.module.css';
import { NewTopicForm, RenameTopicDialog, TopicDetailsDialog } from './TopicDialogs';
import { TopicPicker } from './TopicPicker';
import { NoticeToast, useUndoNotice } from './undoNotice';

type Selection =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'archived' }
  | { kind: 'topic'; id: string };

type View =
  | { kind: 'list' }
  | {
      kind: 'note';
      note: Note;
      focusBlockId: string | null;
      autoFocusTitle: boolean;
      // Cada vez que se abre una nota la pantalla del editor se arma de nuevo.
      nonce: number;
    };

type DialogState = { kind: 'move'; note: NoteSummary } | { kind: 'rename' } | { kind: 'details' };

const EMPTY_PHRASES = {
  all: texts.notes.list.emptyAll,
  none: texts.notes.list.emptyNone,
  topic: texts.notes.list.emptyTopic,
  archived: texts.notes.list.emptyArchived,
} as const;

// Las notas de lo elegido: «Archivadas» muestra solo las archivadas; lo demás, solo las que no.
function inSelection(note: NoteSummary, selection: Selection): boolean {
  if (selection.kind === 'archived') {
    return note.archived;
  }
  if (note.archived) {
    return false;
  }
  if (selection.kind === 'none') {
    return note.topicId === null;
  }
  return selection.kind === 'topic' ? note.topicId === selection.id : true;
}

function TopicButton({
  label,
  current,
  onClick,
  onDropNote,
}: {
  label: string;
  current: boolean;
  onClick: () => void;
  // Si se da, se puede soltar acá una nota arrastrada con el mouse.
  onDropNote?: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.topic}
      aria-current={current ? 'true' : undefined}
      title={label}
      onClick={onClick}
      onDragOver={
        onDropNote
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          : undefined
      }
      onDrop={
        onDropNote
          ? (event) => {
              event.preventDefault();
              onDropNote();
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

// Apuntes › «Notas» (H-09 y H-10): los temas de la materia que se mira, la lista de notas de lo
// elegido y sus acciones. Abrir una nota la muestra en el editor, que reemplaza a la lista.
export function NotesSection({
  subject,
  onViewSubject,
}: {
  subject: Subject;
  // Un enlace puede llevar a una nota de otra materia: la pantalla pasa a mirar esa materia.
  onViewSubject: (subjectId: string) => void;
}) {
  const subjectId = subject.id;
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [view, setView] = useState<View>({ kind: 'list' });
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const working = useRef(false);
  const requests = useRef(0);
  const nonce = useRef(0);
  const dragging = useRef<NoteSummary | null>(null);

  const reload = useCallback(async () => {
    requests.current += 1;
    const mine = requests.current;
    try {
      const [fresh, list] = await Promise.all([
        window.retenia['topics.list']({ subjectId }),
        window.retenia['notes.list']({ subjectId }),
      ]);
      if (requests.current === mine) {
        setTopics(fresh.topics);
        setNotes(list.notes);
        setLoadFailed(false);
      }
    } catch {
      if (requests.current === mine) {
        setLoadFailed(true);
      }
    }
  }, [subjectId]);

  const { notice, say, clear, undo } = useUndoNotice(reload);

  // Al mirar otra materia (y al abrir), todo arranca de cero.
  useEffect(() => {
    setTopics(null);
    setNotes(null);
    setSelection({ kind: 'all' });
    setCreatingTopic(false);
    setDialog(null);
    void reload();
  }, [reload]);

  // Una nota abierta de otra materia no sigue a la vista cuando se pasa a mirar la suya.
  useEffect(() => {
    setView((current) =>
      current.kind === 'note' && current.note.subjectId !== subjectId ? { kind: 'list' } : current,
    );
  }, [subjectId]);

  const visibleTopics = (topics ?? []).filter((topic) => !topic.archived);
  const archivedTopics = (topics ?? []).filter((topic) => topic.archived);
  const selectedTopic =
    selection.kind === 'topic'
      ? visibleTopics.find((topic) => topic.id === selection.id)
      : undefined;
  // Un tema que dejó de estar a la vista (archivado o eliminado) deja de estar elegido.
  const current: Selection =
    selection.kind === 'topic' && !selectedTopic ? { kind: 'all' } : selection;

  const topicName = (topicId: string | null) =>
    topicId === null ? undefined : topics?.find((topic) => topic.id === topicId)?.name;

  // Un pedido por vez: un doble toque no archiva ni mueve dos veces.
  async function act(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    try {
      await task();
    } catch {
      await say(texts.notes.actionFailed);
    } finally {
      working.current = false;
    }
  }

  const choose = (next: Selection) => {
    clear();
    setCreatingTopic(false);
    setSelection(next);
  };

  const newNote = () =>
    act(async () => {
      const note = await window.retenia['notes.create']({
        subjectId,
        topicId: current.kind === 'topic' ? current.id : null,
      });
      clear();
      nonce.current += 1;
      setView({
        kind: 'note',
        note,
        focusBlockId: null,
        autoFocusTitle: true,
        nonce: nonce.current,
      });
    });

  const openNote = (summary: NoteSummary) =>
    act(async () => {
      let note: Note;
      try {
        note = await window.retenia['notes.get']({ noteId: summary.id });
      } catch {
        await say(texts.notes.editor.loadFailed);
        return;
      }
      clear();
      nonce.current += 1;
      setView({
        kind: 'note',
        note,
        focusBlockId: null,
        autoFocusTitle: false,
        nonce: nonce.current,
      });
    });

  // Desde un enlace o desde «Mencionada en»: puede ser de otra materia y puede haber dejado de
  // existir.
  async function openLinked(noteId: string, blockId?: string) {
    let note: Note;
    try {
      note = await window.retenia['notes.get']({ noteId });
    } catch {
      await say(texts.notes.toast.missing);
      return;
    }
    if (note.subjectId !== subjectId) {
      onViewSubject(note.subjectId);
    }
    clear();
    nonce.current += 1;
    setView({
      kind: 'note',
      note,
      focusBlockId: blockId ?? null,
      autoFocusTitle: false,
      nonce: nonce.current,
    });
  }

  const moveNote = (note: NoteSummary, topic: Topic | null) =>
    act(async () => {
      await window.retenia['notes.move']({ noteId: note.id, topicId: topic?.id ?? null });
      setDialog(null);
      await reload();
      await say(
        topic ? texts.notes.toast.moved(topic.name) : texts.notes.toast.movedToNone,
        'note.move',
      );
    });

  const archiveNote = (note: NoteSummary) =>
    act(async () => {
      await window.retenia['notes.archive']({ noteId: note.id });
      await reload();
      await say(texts.notes.toast.archived, 'note.archive');
    });

  const unarchiveNote = (note: NoteSummary) =>
    act(async () => {
      await window.retenia['notes.unarchive']({ noteId: note.id });
      await reload();
      await say(texts.notes.toast.unarchived, 'note.unarchive');
    });

  const removeNote = (note: NoteSummary) =>
    act(async () => {
      await window.retenia['notes.delete']({ noteId: note.id });
      await reload();
      await say(texts.notes.toast.removed, 'note.delete');
    });

  const createTopic = (name: string) =>
    act(async () => {
      const created = await window.retenia['topics.create']({ subjectId, name });
      setCreatingTopic(false);
      await reload();
      await say(texts.notes.toast.topicCreated(created.name));
    });

  const renameTopic = (topic: Topic, name: string) =>
    act(async () => {
      const renamed = await window.retenia['topics.rename']({ topicId: topic.id, name });
      setDialog(null);
      await reload();
      await say(texts.notes.toast.topicRenamed(renamed.name));
    });

  const archiveTopic = (topic: Topic) =>
    act(async () => {
      await window.retenia['topics.archive']({ topicId: topic.id });
      setSelection({ kind: 'all' });
      await reload();
      await say(texts.notes.toast.topicArchived, 'topic.archive');
    });

  const unarchiveTopic = (topic: Topic) =>
    act(async () => {
      await window.retenia['topics.unarchive']({ topicId: topic.id });
      await reload();
      await say(texts.notes.toast.topicUnarchived, 'topic.unarchive');
    });

  const removeTopic = (topic: Topic) =>
    act(async () => {
      await window.retenia['topics.delete']({ topicId: topic.id });
      setSelection({ kind: 'all' });
      await reload();
      await say(texts.notes.toast.topicRemoved, 'topic.delete');
    });

  // Arrastrar con el mouse es un extra: «Mover a…» es la vía de teclado.
  const dropOn = (topic: Topic | null) => {
    const note = dragging.current;
    dragging.current = null;
    if (note) {
      void moveNote(note, topic);
    }
  };

  if (view.kind === 'note') {
    return (
      <>
        <NoticeToast notice={notice} onUndo={undo} />
        <NoteEditor
          key={view.nonce}
          note={view.note}
          focusBlockId={view.focusBlockId}
          autoFocusTitle={view.autoFocusTitle}
          onBack={() => {
            setView({ kind: 'list' });
            void reload();
          }}
          onOpenNote={(noteId, blockId) => void openLinked(noteId, blockId)}
          onSaved={() => void reload()}
        />
      </>
    );
  }

  const shown = (notes ?? []).filter((note) => inSelection(note, current));
  const showTopic = current.kind === 'all' || current.kind === 'archived';

  const detailOf = (note: NoteSummary) => {
    if (!showTopic) {
      return undefined;
    }
    const name = topicName(note.topicId);
    return name === undefined ? texts.notes.list.withoutTopic : texts.notes.list.inTopic(name);
  };

  const row = (note: NoteSummary) => (
    <ListItem
      key={note.id}
      title={note.title === '' ? texts.notes.list.untitled : note.title}
      detail={detailOf(note)}
      onOpen={() => void openNote(note)}
      onDragStart={
        note.archived
          ? undefined
          : (event) => {
              dragging.current = note;
              event.dataTransfer.setData('text/plain', note.id);
              event.dataTransfer.effectAllowed = 'move';
            }
      }
      onDragEnd={
        note.archived
          ? undefined
          : () => {
              dragging.current = null;
            }
      }
      actions={
        note.archived ? (
          <>
            <Boton onClick={() => void unarchiveNote(note)}>{texts.notes.list.unarchive}</Boton>
            <Boton onClick={() => void removeNote(note)}>{texts.notes.list.remove}</Boton>
          </>
        ) : (
          <>
            <Boton onClick={() => setDialog({ kind: 'move', note })}>
              {texts.notes.list.moveTo}
            </Boton>
            <Boton onClick={() => void archiveNote(note)}>{texts.notes.list.archive}</Boton>
            <Boton onClick={() => void removeNote(note)}>{texts.notes.list.remove}</Boton>
          </>
        )
      }
    />
  );

  return (
    <ScreenFrame
      level={3}
      title={texts.notes.notesTab}
      actions={
        <Boton variant="primary" onClick={() => void newNote()}>
          {texts.notes.list.newNote}
        </Boton>
      }
    >
      <NoticeToast notice={notice} onUndo={undo} />
      {loadFailed ? (
        <ViewState
          kind="error"
          phrase={texts.notes.loadFailed}
          action={{ text: texts.notes.retry, onClick: () => void reload() }}
        />
      ) : null}
      {!loadFailed && (topics === null || notes === null) ? (
        <ViewState kind="loading" phrase={texts.notes.loading} />
      ) : null}
      {!loadFailed && topics !== null && notes !== null ? (
        <div className={styles.layout}>
          <div className={styles.side}>
            <nav className={styles.topics} aria-label={texts.notes.topics.label}>
              <TopicButton
                label={texts.notes.topics.all}
                current={current.kind === 'all'}
                onClick={() => choose({ kind: 'all' })}
              />
              {visibleTopics.map((topic) => (
                <TopicButton
                  key={topic.id}
                  label={texts.notes.topics.withCount(topic.name, topic.noteCount)}
                  current={current.kind === 'topic' && current.id === topic.id}
                  onClick={() => choose({ kind: 'topic', id: topic.id })}
                  onDropNote={() => dropOn(topic)}
                />
              ))}
              <TopicButton
                label={texts.notes.topics.none}
                current={current.kind === 'none'}
                onClick={() => choose({ kind: 'none' })}
                onDropNote={() => dropOn(null)}
              />
              <TopicButton
                label={texts.notes.topics.archived}
                current={current.kind === 'archived'}
                onClick={() => choose({ kind: 'archived' })}
              />
            </nav>
            {creatingTopic ? (
              <NewTopicForm
                topics={topics}
                onCreate={createTopic}
                onCancel={() => setCreatingTopic(false)}
              />
            ) : (
              <div>
                <Boton onClick={() => setCreatingTopic(true)}>{texts.notes.topics.newTopic}</Boton>
              </div>
            )}
          </div>
          <div className={styles.content}>
            {selectedTopic ? (
              <div className={styles.topicActions}>
                <Boton onClick={() => setDialog({ kind: 'rename' })}>
                  {texts.notes.topics.rename}
                </Boton>
                <Boton onClick={() => setDialog({ kind: 'details' })}>
                  {texts.notes.topics.details}
                </Boton>
                <Boton onClick={() => void archiveTopic(selectedTopic)}>
                  {texts.notes.topics.archive}
                </Boton>
                <Boton onClick={() => void removeTopic(selectedTopic)}>
                  {texts.notes.topics.remove}
                </Boton>
              </div>
            ) : null}
            {current.kind === 'archived' ? (
              <>
                {shown.length === 0 && archivedTopics.length === 0 ? (
                  <ViewState kind="empty" phrase={EMPTY_PHRASES.archived} />
                ) : null}
                {shown.length > 0 ? (
                  <div className={styles.group}>
                    <h4>{texts.notes.list.archivedLabel}</h4>
                    <ItemList label={texts.notes.list.archivedLabel}>{shown.map(row)}</ItemList>
                  </div>
                ) : null}
                {archivedTopics.length > 0 ? (
                  <div className={styles.group}>
                    <h4>{texts.notes.topics.archivedTopicsLabel}</h4>
                    <ItemList label={texts.notes.topics.archivedTopicsLabel}>
                      {archivedTopics.map((topic) => (
                        <ListItem
                          key={topic.id}
                          title={topic.name}
                          actions={
                            <Boton onClick={() => void unarchiveTopic(topic)}>
                              {texts.notes.topics.unarchive}
                            </Boton>
                          }
                        />
                      ))}
                    </ItemList>
                  </div>
                ) : null}
              </>
            ) : null}
            {current.kind !== 'archived' && shown.length === 0 ? (
              <ViewState kind="empty" phrase={EMPTY_PHRASES[current.kind]} />
            ) : null}
            {current.kind !== 'archived' && shown.length > 0 ? (
              <ItemList label={texts.notes.list.label}>{shown.map(row)}</ItemList>
            ) : null}
          </div>
        </div>
      ) : null}
      {dialog?.kind === 'move' ? (
        <TopicPicker
          title={texts.notes.list.moveTitle}
          topics={visibleTopics}
          noTopicsText={texts.notes.list.moveNoTopics}
          noneText={texts.notes.list.moveNone}
          onPick={(topicId) =>
            void moveNote(dialog.note, visibleTopics.find((topic) => topic.id === topicId) ?? null)
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'rename' && selectedTopic && topics ? (
        <RenameTopicDialog
          topic={selectedTopic}
          topics={topics}
          onRename={(name) => renameTopic(selectedTopic, name)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'details' && selectedTopic ? (
        <TopicDetailsDialog topic={selectedTopic} onClose={() => setDialog(null)} />
      ) : null}
    </ScreenFrame>
  );
}
