import type { EditorView } from '@tiptap/pm/view';
import { type MutableRefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { notesTitlesResponse } from '../../../preload/contract/notes';
import { texts } from '../../../preload/contract/texts';
import styles from './editor.module.css';
import { dismissMention, insertMention, type MentionSuggestionState } from './mention-plugin';

type Entry = z.output<typeof notesTitlesResponse>['notes'][number];

export type KeyHandler = MutableRefObject<((event: KeyboardEvent) => boolean) | null>;

// La lista de notas para enlazar que aparece con «[[». El foco no sale del editor: la elegida se
// señala con aria-activedescendant y las flechas, Enter y Esc llegan por el editor.
export function MentionMenu({
  view,
  suggestion,
  keyHandler,
}: {
  view: EditorView;
  suggestion: MentionSuggestionState;
  keyHandler: KeyHandler;
}) {
  const base = useId();
  const host = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<Entry[] | null>(null);
  const [active, setActive] = useState(0);
  const { query } = suggestion;

  useEffect(() => {
    let current = true;
    window.retenia['notes.titles']({ query }).then(
      ({ notes }) => {
        if (current) {
          setFound(notes);
          setActive(0);
        }
      },
      () => {
        if (current) {
          setFound(null);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [query]);

  const entries = found ?? [];
  const optionId = (index: number) => `${base}-${index}`;
  const listId = `${base}-lista`;

  function pick(entry: Entry) {
    insertMention(view, suggestion, { id: entry.id, label: entry.title });
  }

  useEffect(() => {
    keyHandler.current = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return false;
      }
      if (event.key === 'Escape') {
        dismissMention(view);
        return true;
      }
      const chosen = entries[active];
      if (chosen === undefined) {
        return false;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : entries.length - 1;
        setActive((active + step) % entries.length);
        return true;
      }
      if (event.key === 'Enter') {
        pick(chosen);
        return true;
      }
      return false;
    };
    return () => {
      keyHandler.current = null;
    };
  });

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    view.dom.setAttribute('aria-controls', listId);
    view.dom.setAttribute('aria-activedescendant', optionId(active));
    return () => {
      view.dom.removeAttribute('aria-controls');
      view.dom.removeAttribute('aria-activedescendant');
    };
  });

  // Junto al cursor; si no se pueden medir las posiciones queda debajo del editor.
  useLayoutEffect(() => {
    const element = host.current;
    const container = element?.parentElement;
    if (!element || !container) {
      return;
    }
    try {
      const caret = view.coordsAtPos(suggestion.to);
      const box = container.getBoundingClientRect();
      element.style.left = `${Math.max(0, caret.left - box.left)}px`;
      element.style.top = `${caret.bottom - box.top + 4}px`;
    } catch {
      element.style.removeProperty('left');
      element.style.removeProperty('top');
    }
  });

  if (found === null) {
    return null;
  }
  return (
    <div ref={host} className={styles.menu}>
      {entries.length === 0 ? (
        <p role="status" className={styles.menuEmpty}>
          {texts.notes.editor.mentionEmpty}
        </p>
      ) : (
        <div
          id={listId}
          role="listbox"
          aria-label={texts.notes.editor.mentionList}
          className={styles.options}
        >
          {entries.map((entry, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: el foco no sale del editor; ↑, ↓ y Enter llegan por él
            <div
              key={entry.id}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              className={styles.option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(entry)}
            >
              {texts.notes.editor.mentionOption(
                entry.title === '' ? texts.notes.list.untitled : entry.title,
                entry.topicName,
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
