import { Fragment, useEffect, useRef, useState } from 'react';
import type { InlineNode } from '../../preload/contract/notes';
import { texts } from '../../preload/contract/texts';
import { findFormulas } from '../notes/editor/formula';
import { drawFormula } from '../notes/editor/formula-render';
import { imageSource } from '../notes/editor/image-source';
import styles from './Cards.module.css';

// Una fórmula entre signos $ se ve como en un libro (CA-378); si KaTeX no la entiende, se ve el texto.
function Formula({ source }: { source: string }) {
  const holder = useRef<HTMLSpanElement>(null);
  const drawn = drawFormula(source);
  useEffect(() => {
    if (holder.current && drawn) {
      holder.current.replaceChildren(drawn.cloneNode(true));
    }
  }, [drawn]);
  if (!drawn) {
    return <span>{`$${source}$`}</span>;
  }
  return <span ref={holder} data-formula="rendered" className={styles.formula} />;
}

// El texto con sus fórmulas dibujadas.
function Text({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const formula of findFormulas(text)) {
    if (formula.from > from) {
      parts.push(<Fragment key={`t${from}`}>{text.slice(from, formula.from)}</Fragment>);
    }
    parts.push(<Formula key={`f${formula.from}`} source={formula.source} />);
    from = formula.to;
  }
  if (from < text.length) {
    parts.push(<Fragment key={`t${from}`}>{text.slice(from)}</Fragment>);
  }
  return <>{parts}</>;
}

// La imagen queda del lado de la tarjeta en que estaba en el renglón (CA-377).
function Picture({ node }: { node: Extract<InlineNode, { type: 'image' }> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    imageSource(node.sha).then(
      (loaded) => {
        if (current) {
          setSrc(loaded);
        }
      },
      () => {
        if (current) {
          setFailed(true);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [node.sha]);
  if (failed) {
    return <span className={styles.imageFailed}>{texts.notes.editor.imageLoadFailed}</span>;
  }
  if (src === null) {
    return null;
  }
  return (
    <img
      className={styles.image}
      src={src}
      alt={node.alt === '' ? texts.notes.editor.imageAlt : node.alt}
      width={node.width}
      height={node.height}
    />
  );
}

// Un lado de la tarjeta (la pregunta o la respuesta): texto con fórmulas e imágenes.
export function CardFace({ content }: { content: readonly InlineNode[] }) {
  return (
    <p className={styles.face}>
      {content.map((node, index) => {
        const key = `${index}-${node.type}`;
        if (node.type === 'image') {
          return <Picture key={key} node={node} />;
        }
        if (node.type === 'mention') {
          return <Fragment key={key}>{node.label}</Fragment>;
        }
        return <Text key={key} text={node.text} />;
      })}
    </p>
  );
}
