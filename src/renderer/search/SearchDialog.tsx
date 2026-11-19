import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SearchHit } from '../../preload/contract/search';
import { texts } from '../../preload/contract/texts';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { Marked } from './Marked';
import styles from './Search.module.css';

// Lo que se repite del texto buscado en el mensaje «No encontré nada con…» no pasa de esto.
const SHOWN_LENGTH = 80;

interface Group {
  group: SearchHit['group'];
  hits: SearchHit[];
}

// Los resultados en grupos, uno por tipo. Va primero el grupo que tiene el mejor resultado.
function groupsOf(results: readonly SearchHit[]): Group[] {
  const groups: Group[] = [];
  for (const hit of results) {
    const group = hit.group;
    const found = groups.find((item) => item.group === group);
    if (found) {
      found.hits.push(hit);
    } else {
      groups.push({ group, hits: [hit] });
    }
  }
  return groups;
}

function shown(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  const letters = [...clean];
  return letters.length > SHOWN_LENGTH ? `${letters.slice(0, SHOWN_LENGTH).join('')}…` : clean;
}

function contextOf(hit: SearchHit): string {
  return [hit.subjectName, hit.topicName].filter((part): part is string => !!part).join(' › ');
}

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; results: SearchHit[]; recent: boolean; for: string };

// Ctrl+K o «Buscar» (H-23): un campo y, abajo, los resultados agrupados por tipo. Con flechas y
// Enter se elige; con Esc se cierra y el foco vuelve a donde estaba. Sin texto muestra lo que
// abriste hace poco. El texto que escribió quien busca y el de los resultados se muestran siempre
// como texto, nunca como código.
export function SearchDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  // Quien lo abrió decide adónde lleva un resultado (a la pantalla, o a un panel en una sesión).
  onOpen: (hit: SearchHit) => void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [selected, setSelected] = useState(0);
  const requests = useRef(0);
  const options = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    requests.current += 1;
    const mine = requests.current;
    window.retenia['search.query']({ text }).then(
      ({ results, recent }) => {
        if (mine === requests.current) {
          setState({ status: 'ready', results, recent, for: text });
          setSelected(0);
        }
      },
      () => {
        if (mine === requests.current) {
          setState({ status: 'failed' });
        }
      },
    );
  }, [text]);

  const groups = useMemo(() => (state.status === 'ready' ? groupsOf(state.results) : []), [state]);
  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  useEffect(() => {
    options.current.get(selected)?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const open = useCallback(
    (hit: SearchHit) => {
      window.retenia['search.opened']({ docId: hit.docId })
        .catch(() => undefined)
        .finally(() => onOpen(hit));
    },
    [onOpen],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(flat.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      const hit = flat[selected];
      if (hit) {
        event.preventDefault();
        open(hit);
      }
    }
  };

  let index = -1;
  const activeId = flat.length > 0 ? `${listId}-option-${selected}` : undefined;
  const ready = state.status === 'ready' ? state : null;
  const typed = text.trim() !== '';

  return (
    <Dialog title={texts.nav.search} onClose={onClose}>
      <div className={styles.box}>
        <input
          className={styles.input}
          autoFocus
          role="combobox"
          aria-label={texts.search.label}
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={texts.search.placeholder}
          maxLength={300}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {state.status === 'failed' ? (
          <BannerEstado tone="attention">{texts.search.failed}</BannerEstado>
        ) : null}
        {ready?.recent && flat.length === 0 ? (
          <p className={styles.emptyHint}>{texts.search.recentEmpty}</p>
        ) : null}
        {ready && !ready.recent && flat.length === 0 && typed ? (
          <p className={styles.empty}>
            <span>{texts.search.noResults(shown(ready.for))}</span>
            <span className={styles.emptyHint}>{texts.search.noResultsHint}</span>
          </p>
        ) : null}
        <div
          id={listId}
          role="listbox"
          aria-label={texts.search.resultsLabel}
          className={styles.results}
          hidden={flat.length === 0}
        >
          {ready?.recent && flat.length > 0 ? (
            <p className={styles.groupTitle}>{texts.search.recentTitle}</p>
          ) : null}
          {groups.map((group) => (
            <fieldset
              key={group.group}
              aria-label={texts.search.groups[group.group]}
              className={styles.group}
            >
              {ready?.recent ? null : (
                <p className={styles.groupTitle} aria-hidden="true">
                  {texts.search.groups[group.group]}
                </p>
              )}
              {group.hits.map((hit) => {
                index += 1;
                const mine = index;
                const place = contextOf(hit);
                return (
                  <div
                    key={hit.docId}
                    id={`${listId}-option-${mine}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={mine === selected}
                    className={styles.option}
                    ref={(element) => {
                      if (element) {
                        options.current.set(mine, element);
                      } else {
                        options.current.delete(mine);
                      }
                    }}
                    onMouseMove={() => setSelected(mine)}
                    onClick={() => open(hit)}
                    onKeyDown={undefined}
                  >
                    <span className={styles.top}>
                      <span className={styles.kind}>{texts.search.kinds[hit.kind]}</span>
                      <span className={styles.title}>
                        {hit.title.length === 0 ? (
                          texts.search.untitled
                        ) : (
                          <Marked segments={hit.title} />
                        )}
                      </span>
                    </span>
                    {hit.fragment.length > 0 ? (
                      <span className={styles.fragment}>
                        <Marked segments={hit.fragment} />
                      </span>
                    ) : null}
                    {place !== '' || hit.archived ? (
                      <span className={styles.context}>
                        {[place, hit.archived ? texts.search.archived : '']
                          .filter((part) => part !== '')
                          .join(' · ')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
