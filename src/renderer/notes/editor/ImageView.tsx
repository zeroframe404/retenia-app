import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { texts } from '../../../preload/contract/texts';
import styles from './editor.module.css';
import { imageSource } from './image-source';

type Loaded = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'failed' };

// La imagen del renglón: pide sus bytes por la huella y se achica al ancho disponible sin
// deformarse. Si no se pueden leer, lo dice con palabras.
export function ImageView({ node }: NodeViewProps) {
  const sha = String(node.attrs.sha);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setLoaded({ status: 'loading' });
    imageSource(sha).then(
      (src) => {
        if (current) {
          setLoaded({ status: 'ready', src });
        }
      },
      () => {
        if (current) {
          setLoaded({ status: 'failed' });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [sha]);

  const alt =
    typeof node.attrs.alt === 'string' && node.attrs.alt !== ''
      ? node.attrs.alt
      : texts.notes.editor.imageAlt;
  return (
    <NodeViewWrapper as="span" className={styles.imageNode}>
      {loaded.status === 'ready' ? (
        <img
          className={styles.image}
          src={loaded.src}
          alt={alt}
          width={Number(node.attrs.width)}
          height={Number(node.attrs.height)}
        />
      ) : null}
      {loaded.status === 'failed' ? (
        <span className={styles.imageFailed}>{texts.notes.editor.imageLoadFailed}</span>
      ) : null}
    </NodeViewWrapper>
  );
}
