import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { texts } from '../../../preload/contract/texts';
import styles from './editor.module.css';
import type { MentionOptions } from './mention';

// El enlace a otra nota, dibujado como un enlace: se alcanza con Tab y con Enter o un clic abre la
// nota.
export function MentionView({ node, extension }: NodeViewProps) {
  const options = extension.options as MentionOptions;
  const label =
    typeof node.attrs.label === 'string' && node.attrs.label !== ''
      ? node.attrs.label
      : texts.notes.list.untitled;
  return (
    <NodeViewWrapper as="span">
      <a
        href={`#nota-${String(node.attrs.id)}`}
        className={styles.mention}
        aria-label={texts.notes.editor.mentionOpen(label)}
        onClick={(event) => {
          event.preventDefault();
          options.onOpen(String(node.attrs.id));
        }}
      >
        {label}
      </a>
    </NodeViewWrapper>
  );
}
