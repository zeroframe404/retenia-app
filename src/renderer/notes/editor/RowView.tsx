import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { texts } from '../../../preload/contract/texts';
import { Icon } from '../../ui/Icon';
import styles from './editor.module.css';

// El dibujo de un renglón: el asa para arrastrarlo, el botón de plegar (solo si tiene hijos) y un
// punto. Los dos botones quedan fuera del orden de Tab: cada uno tiene su atajo de teclado.
export function RowView({ node, updateAttributes }: NodeViewProps) {
  const collapsed = node.attrs.collapsed === true;
  const hasChildren = node.childCount > 1;
  const foldLabel = collapsed ? texts.notes.editor.unfold : texts.notes.editor.fold;
  return (
    <NodeViewWrapper className={styles.row}>
      <div className={styles.controls} contentEditable={false}>
        <button
          type="button"
          className={styles.handle}
          data-drag-handle=""
          draggable
          tabIndex={-1}
          aria-label={texts.notes.editor.drag}
          title={texts.notes.editor.drag}
        >
          <Icon icon={GripVertical} />
        </button>
        {hasChildren ? (
          <button
            type="button"
            className={styles.control}
            tabIndex={-1}
            aria-expanded={!collapsed}
            aria-label={foldLabel}
            title={foldLabel}
            onClick={() => updateAttributes({ collapsed: !collapsed })}
          >
            <Icon icon={collapsed ? ChevronRight : ChevronDown} />
          </button>
        ) : (
          <span className={styles.spacer} />
        )}
        <span className={styles.bullet} aria-hidden="true" />
      </div>
      <NodeViewContent className={styles.content} />
    </NodeViewWrapper>
  );
}
