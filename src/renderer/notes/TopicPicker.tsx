import type { Topic } from '../../preload/contract/organization';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import styles from './Notes.module.css';

// «Mover a…»: un botón por tema (sin los archivados) y, si se da, uno para dejarla sin tema. Sirve
// para una nota y para un elemento de la Bandeja.
export function TopicPicker({
  title,
  topics,
  noTopicsText,
  noneText,
  onPick,
  onClose,
}: {
  title: string;
  topics: readonly Topic[];
  noTopicsText: string;
  noneText?: string;
  onPick: (topicId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      {topics.length === 0 ? <p className={styles.dialogText}>{noTopicsText}</p> : null}
      <div className={styles.choices}>
        {topics.map((topic) => (
          <Boton key={topic.id} title={topic.name} onClick={() => onPick(topic.id)}>
            {topic.name}
          </Boton>
        ))}
        {noneText === undefined ? null : <Boton onClick={() => onPick(null)}>{noneText}</Boton>}
      </div>
    </Dialog>
  );
}
