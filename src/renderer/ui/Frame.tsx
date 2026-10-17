import {
  BookOpen,
  ChartNoAxesColumn,
  GraduationCap,
  Languages,
  Library,
  type LucideIcon,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { texts } from '../../preload/contract/texts';
import { IconButton } from './Boton';
import styles from './Frame.module.css';
import { Icon } from './Icon';

// El armazón de la ventana: el riel lateral, el marco de cada pantalla, las secciones de una
// pantalla, la lista, el cartel breve, el panel lateral derecho y el diálogo.

export type Destination = 'study' | 'notes' | 'materials' | 'languages' | 'progress' | 'settings';

// En este orden: Ctrl+1 a Ctrl+6 abren cada uno.
export const DESTINATIONS: readonly { destination: Destination; text: string; icon: LucideIcon }[] =
  [
    { destination: 'study', text: texts.nav.study, icon: GraduationCap },
    { destination: 'notes', text: texts.nav.notes, icon: BookOpen },
    { destination: 'materials', text: texts.nav.materials, icon: Library },
    { destination: 'languages', text: texts.nav.languages, icon: Languages },
    { destination: 'progress', text: texts.nav.progress, icon: ChartNoAxesColumn },
    { destination: 'settings', text: texts.nav.settings, icon: Settings },
  ];

// El riel lateral: el nombre del programa escrito con la tipografía de títulos, «Buscar» (Ctrl+K)
// y los seis destinos. En una ventana angosta se compacta: quedan los íconos y cada botón
// conserva su nombre para el lector de pantalla. Sin elementos de lista: las listas de la ventana
// son solo las de los datos.
export function SideRail({
  current,
  onChange,
  onSearch,
}: {
  current: Destination;
  onChange: (destination: Destination) => void;
  onSearch: () => void;
}) {
  return (
    <div className={styles.rail}>
      <h1 className={styles.brand}>{texts.appName}</h1>
      <nav className={styles.navigation} aria-label={texts.nav.label}>
        <button
          type="button"
          className={styles.search}
          aria-keyshortcuts="Control+K"
          title={texts.nav.search}
          onClick={onSearch}
        >
          <Icon icon={Search} />
          <span className={styles.label}>{texts.nav.search}</span>
          <kbd className={styles.shortcut}>{texts.nav.searchShortcut}</kbd>
        </button>
        {DESTINATIONS.map(({ destination, text, icon }, index) => (
          <button
            key={destination}
            type="button"
            className={styles.destination}
            aria-current={destination === current ? 'page' : undefined}
            aria-keyshortcuts={`Control+${index + 1}`}
            title={text}
            onClick={() => onChange(destination)}
          >
            <Icon icon={icon} />
            <span className={styles.label}>{text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// El marco de una pantalla: su título y, a la derecha, lo que se pueda hacer desde acá. Al llegar
// por un atajo o por el riel, el foco pasa al título (así el lector de pantalla dice dónde estás
// y el siguiente Tab sigue desde ahí).
export function ScreenFrame({
  title,
  level = 2,
  actions,
  focusTitle = false,
  children,
}: {
  title: string;
  level?: 2 | 3;
  actions?: ReactNode;
  focusTitle?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) {
      heading.current?.focus();
    }
  }, [focusTitle]);
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section className={styles.screen} data-level={level} aria-labelledby={id}>
      <div className={styles.header}>
        <Heading id={id} ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </Heading>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Las secciones de una pantalla (hoy, las de Apuntes): botones con la actual marcada.
export function SectionTabs<T extends string>({
  label,
  sections,
  current,
  onChange,
}: {
  label: string;
  sections: readonly { value: T; text: string }[];
  current: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav className={styles.sections} aria-label={label}>
      {sections.map(({ value, text }) => (
        <button
          key={value}
          type="button"
          className={styles.section}
          aria-current={value === current ? 'page' : undefined}
          onClick={() => onChange(value)}
        >
          {text}
        </button>
      ))}
    </nav>
  );
}

// La lista de los datos: un renglón por elemento, con su título (que si es larguísimo se corta con
// puntos suspensivos y no desarma la lista), su detalle y sus acciones a la derecha.
export function ItemList({
  label,
  ordered = false,
  children,
}: {
  label: string;
  ordered?: boolean;
  children: ReactNode;
}) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={styles.list} aria-label={label}>
      {children}
    </Tag>
  );
}

export function ListItem({
  title,
  text,
  detail,
  actions,
  children,
}: {
  title?: string;
  text?: string;
  detail?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className={styles.item}>
      <div className={styles.body}>
        {title === undefined ? null : <p className={styles.itemTitle}>{title}</p>}
        {text === undefined ? null : <p className={styles.itemText}>{text}</p>}
        {detail === undefined ? null : <p className={styles.detail}>{detail}</p>}
        {children}
      </div>
      {actions ? <div className={styles.itemActions}>{actions}</div> : null}
    </li>
  );
}

export type ToastTone = 'info' | 'success' | 'attention';

// El cartel breve: dice qué pasó después de una acción («Tarjeta guardada»). La zona se anuncia
// al lector de pantalla y está siempre; sin texto no se ve.
export function Toast({
  tone = 'info',
  onClose,
  children,
}: {
  tone?: ToastTone | undefined;
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <div role="status" className={styles.toastZone}>
      {children ? (
        <div className={styles.toast} data-component="toast" data-tone={tone}>
          <p className={styles.toastMessage}>{children}</p>
          {onClose ? <IconButton icon={X} label={texts.ui.close} onClick={onClose} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// El panel lateral derecho: un complemento que se abre sin salir de lo que estás haciendo (como
// el buscador dentro de una sesión). No tapa la pantalla ni bloquea el resto.
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <aside className={styles.panel} data-component="side-panel" aria-labelledby={id}>
      <div className={styles.panelHeader}>
        <h2 id={id} className={styles.panelTitle}>
          {title}
        </h2>
        <IconButton icon={X} label={texts.ui.panelClose} onClick={onClose} />
      </div>
      {children}
    </aside>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// El diálogo: tapa lo demás, mantiene el foco adentro (Tab da la vuelta), se cierra con Esc o con
// su botón y, al cerrarse, devuelve el foco a lo que lo abrió. Es lo único que flota.
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('raiz');
    root?.setAttribute('inert', '');
    dialog.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) {
        return;
      }
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root?.removeAttribute('inert');
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return createPortal(
    <div className={styles.scrim}>
      <div
        ref={dialog}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className={styles.panelHeader}>
          <h2 id={id} className={styles.panelTitle}>
            {title}
          </h2>
          <IconButton icon={X} label={texts.ui.close} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
