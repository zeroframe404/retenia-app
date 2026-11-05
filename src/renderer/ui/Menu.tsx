import { useEffect, useId, useRef, useState } from 'react';
import { Boton } from './Boton';
import styles from './Menu.module.css';

export interface MenuItem {
  key: string;
  text: string;
  onSelect: () => void;
}

// Un menú de acciones detrás de un botón («Más» en la sesión): se abre con un toque o con Enter,
// las flechas recorren las opciones, Esc lo cierra (sin hacer nada más: la tecla no sigue de
// largo) y el foco vuelve al botón. Tocar afuera también lo cierra.
export function MenuAcciones({
  label,
  items,
  disabled = false,
}: {
  label: string;
  items: readonly MenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      button.current?.querySelector('button')?.focus();
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(at + step + options.length) % options.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? options[0] : options.at(-1))?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.menu}>
      <div ref={button}>
        <Boton
          variant="quiet"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          {label}
        </Boton>
      </div>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className={styles.list}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
