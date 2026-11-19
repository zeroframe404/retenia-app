import type { SearchHit } from '../../preload/contract/search';
import styles from './Search.module.css';

// Un texto en tramos: lo que coincide con lo buscado va marcado. Cada tramo se escribe como texto
// de React, así lo que diga un apunte o una tarjeta nunca se interpreta como código.
export function Marked({ segments }: { segments: SearchHit['title'] }) {
  return (
    <>
      {segments.map((segment, at) =>
        segment.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: los tramos de un texto no se reordenan.
          <mark key={at} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: los tramos de un texto no se reordenan.
          <span key={at}>{segment.text}</span>
        ),
      )}
    </>
  );
}
